#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { autoLoginIxl } from "../src/lib/ixl-auto-login.mjs";
import { createHash, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";

function deriveKey(secret) {
  return createHash("sha256").update(secret).digest();
}

function decryptCredential(encryptedData, secretKey) {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = deriveKey(secretKey);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function getDbCredentials(account) {
  if (!account.auto_login_enabled || !account.login_credentials_encrypted) {
    return null;
  }
  const key = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) return null;
  try {
    return JSON.parse(decryptCredential(account.login_credentials_encrypted, key));
  } catch {
    return null;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少环境变量");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const IXL_CREDENTIALS = {
  username: process.env.IXL_USERNAME,
  password: process.env.IXL_PASSWORD,
};

const IXL_SUBJECTS = [
  { queryValue: "0", label: "math" },
  { queryValue: "1", label: "ela" },
];

function isIxlLoginPage(html) {
  return (
    /<title>\s*(sign in to ixl|log in to ixl|signin)\s*<\/title>/i.test(html) ||
    /<form[^>]+action=["'][^"']*\/signin/i.test(html) ||
    /<input[^>]+type=["']password["']/i.test(html)
  );
}

async function fetchIxlActivities(payload) {
  const cookies = payload?.cookies;
  if (!cookies?.length) throw new Error("Missing cookies");

  const cookieHeader = cookies
    .filter((c) => c?.name && c?.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const activities = [];

  for (const subject of IXL_SUBJECTS) {
    const url = new URL("https://www.ixl.com/analytics/student-usage/run");
    url.searchParams.set("subjects", subject.queryValue);

    const response = await fetch(String(url), {
      headers: {
        cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.ixl.com/analytics/student-usage",
        Origin: "https://www.ixl.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        Connection: "keep-alive",
      },
    });

    const body = await response.text();

    if (response.status === 403 || response.status === 401 || isIxlLoginPage(body)) {
      throw new Error("Session expired");
    }
    if (response.status === 404) {
      throw new Error("IXL page not found");
    }

    const parsed = JSON.parse(body);
    const sessions = Array.isArray(parsed?.table) ? parsed.table : null;
    if (!sessions) throw new Error("No usage table found");

    activities.push(
      ...sessions.flatMap((session) => {
        const occurredAt =
          typeof session?.sessionStartLocalDateStr === "string"
            ? `${session.sessionStartLocalDateStr}T00:00:00`
            : null;
        const practiceSession =
          typeof session?.practiceSession === "string"
            ? session.practiceSession
            : "session";
        const skills = Array.isArray(session?.skills) ? session.skills : [];

        return skills
          .filter((skill) => occurredAt && skill && typeof skill === "object")
          .map((skill) => ({
            occurredAt,
            skillId: skill.skillCode ?? skill.permacode ?? skill.skill ?? "unknown",
            skillName: skill.skillName ?? "Unknown",
            subject: subject.label,
            scorePercent: typeof skill.score === "number" ? skill.score : null,
            durationSeconds: typeof skill.secondsSpent === "number" ? skill.secondsSpent : null,
            sessionId: `${practiceSession}:${skill.skillCode ?? skill.permacode ?? skill.skill ?? "unknown"}`,
          }));
      })
    );
  }

  // Aggregate by date + skill
  const aggregated = new Map();
  for (const activity of activities) {
    const key = [
      activity.occurredAt.slice(0, 10),
      activity.subject ?? "",
      activity.skillId,
      activity.skillName,
    ].join("::");
    const existing = aggregated.get(key);

    if (!existing) {
      aggregated.set(key, activity);
      continue;
    }

    aggregated.set(key, {
      ...existing,
      durationSeconds:
        (existing.durationSeconds ?? 0) + (activity.durationSeconds ?? 0),
      scorePercent: activity.scorePercent ?? existing.scorePercent ?? null,
    });
  }

  return Array.from(aggregated.values()).sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt)
  );
}

async function syncIxlAccount(account) {
  if (!account.managed_session_payload?.cookies?.length) {
    console.log(`  ⚠️  ${account.external_account_ref}: 没有 Session`);
    return { status: "skipped", reason: "no_session" };
  }

  try {
    console.log(`  🌐 正在抓取 IXL 学习记录...`);
    const activities = await fetchIxlActivities(account.managed_session_payload);

    console.log(`  ✅ 找到 ${activities.length} 条学习记录`);

    if (activities.length === 0) {
      return { status: "no_data" };
    }

    let inserted = 0;
    let duplicates = 0;
    const householdTimeZone = "Asia/Shanghai";

    for (const activity of activities) {
      const localDateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: householdTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(activity.occurredAt));

      const eventData = {
        child_id: account.child_id,
        platform: "ixl",
        platform_account_id: account.id,
        occurred_at: activity.occurredAt,
        local_date_key: localDateKey,
        event_type: "skill_practice",
        title: activity.skillName,
        subject: activity.subject,
        duration_minutes: activity.durationSeconds
          ? Math.round(activity.durationSeconds / 60)
          : null,
        score: activity.scorePercent !== null ? activity.scorePercent / 100 : null,
        completion_state: "completed",
        source_ref: activity.sessionId,
        raw_payload: {
          skillId: activity.skillId,
          skillName: activity.skillName,
          subject: activity.subject,
          scorePercent: activity.scorePercent,
          durationSeconds: activity.durationSeconds,
          sessionId: activity.sessionId,
        },
      };

      const { error } = await supabase.from("learning_events").insert(eventData);

      if (error?.message?.includes("learning_events_account_source_key")) {
        duplicates++;
      } else if (error) {
        console.log(`    ❌ 插入失败: ${error.message}`);
      } else {
        inserted++;
      }
    }

    await supabase
      .from("platform_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        status: "active",
        last_sync_error_summary: null,
      })
      .eq("id", account.id);

    console.log(`  📊 插入: ${inserted}, 重复: ${duplicates}`);

    return {
      status: "completed",
      fetchedCount: activities.length,
      insertedCount: inserted,
      duplicateCount: duplicates,
    };
  } catch (err) {
    const isSessionExpired =
      err.message === "Session expired" || err.message?.includes("Session expired");

    if (isSessionExpired) {
      const failCount = account._loginFailCount || 0;
      if (failCount >= 3) {
        console.error(`  ❌ 连续 ${failCount} 次登录失败，已停止重试以避免风控`);
        await supabase
          .from("platform_accounts")
          .update({
            status: "attention_required",
            last_sync_error_summary: `Too many login failures (${failCount}), blocked for safety`,
          })
          .eq("id", account.id);
        return { status: "error", error: "Login rate-limited for safety" };
      }

      const backoff = [60, 300, 900][failCount]; // 1min → 5min → 15min
      console.log(`  🔄 Session 过期，${backoff}s 退避后自动重新登录...`);
      await new Promise((r) => setTimeout(r, backoff * 1000));

      try {
        const dbCreds = getDbCredentials(account);
        const creds = dbCreds ?? IXL_CREDENTIALS;
        if (!creds?.username || !creds?.password) {
          throw new Error("No credentials available (neither DB nor .env.local)");
        }
        console.log(`  🔑 使用${dbCreds ? "数据库" : ".env.local"}凭据重新登录...`);
        const loginResult = await autoLoginIxl(creds.username, creds.password);
        const newPayload = { cookies: loginResult.cookies };
        await supabase
          .from("platform_accounts")
          .update({
            managed_session_payload: newPayload,
            managed_session_captured_at: new Date().toISOString(),
          })
          .eq("id", account.id);

        account.managed_session_payload = newPayload;
        account._loginFailCount = 0;
        console.log(`  ✅ 重新登录成功，重试同步...`);
        return syncIxlAccount(account);
      } catch (reloginErr) {
        account._loginFailCount = failCount + 1;
        console.error(`  ❌ 自动登录失败 (${account._loginFailCount}/3): ${reloginErr.message}`);
        await supabase
          .from("platform_accounts")
          .update({
            status: "attention_required",
            last_sync_error_summary: `Auto-relogin failed (#${account._loginFailCount}): ${reloginErr.message}`,
          })
          .eq("id", account.id);
        return { status: "error", error: reloginErr.message };
      }
    }

    console.error(`  ❌ ${account.external_account_ref}: ${err.message}`);

    await supabase
      .from("platform_accounts")
      .update({
        status: "attention_required",
        last_sync_error_summary: err.message,
      })
      .eq("id", account.id);

    return { status: "error", error: err.message };
  }
}

async function main() {
  console.log("🔍 查询 IXL 账号...\n");

  const { data: accounts, error } = await supabase
    .from("platform_accounts")
    .select("id, child_id, external_account_ref, status, managed_session_payload, login_credentials_encrypted, auto_login_enabled")
    .eq("platform", "ixl");

  if (error) {
    console.error("❌ 查询失败:", error.message);
    process.exit(1);
  }

  if (!accounts || accounts.length === 0) {
    console.log("⚠️  数据库中没有 IXL 账号");
    process.exit(0);
  }

  console.log(`找到 ${accounts.length} 个账号\n`);

  for (const account of accounts) {
    console.log(`🔄 同步: ${account.external_account_ref}`);
    const result = await syncIxlAccount(account);
    console.log(`   结果: ${result.status}\n`);
  }

  console.log("✅ 同步完成");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
