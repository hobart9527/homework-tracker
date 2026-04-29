#!/usr/bin/env node

/**
 * Khan Academy 学习记录同步脚本
 *
 * 通过 Playwright 打开进度页，调用浏览器内的 GraphQL API 提取学习记录，
 * 写入 learning_events。Session 过期时自动重新登录。
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
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

const KHAN_CREDENTIALS = {
  username: process.env.KHAN_USERNAME,
  password: process.env.KHAN_PASSWORD,
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少环境变量");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ACTIVITY_QUERY = `query ActivitySessionsV2Query($studentKaid: String!, $endDate: Date, $startDate: Date, $courseType: String, $activityKind: String, $after: ID, $pageSize: Int) {
  user(kaid: $studentKaid) {
    id
    activityLogV2(
      endDate: $endDate
      startDate: $startDate
      courseType: $courseType
      activityKind: $activityKind
    ) {
      time {
        exerciseMinutes
        totalMinutes
        __typename
      }
      activitySessions(pageSize: $pageSize, after: $after) {
        sessions {
          ...ActivitySession
          ... on BasicActivitySession {
            aiGuideThread {
              title
              id
              __typename
            }
            essaySession {
              essayTitle
              id
              __typename
            }
            __typename
          }
          ... on MasteryActivitySession {
            correctCount
            problemCount
            skillLevels {
              ...ActivitySessionSkillLevels
              exercise {
                id
                translatedTitle
                __typename
              }
              __typename
            }
            task {
              id
              isRestarted
              __typename
            }
            __typename
          }
          __typename
        }
        pageInfo {
          nextCursor
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment ActivitySession on ActivitySession {
  id
  title
  subtitle
  activityKind {
    id
    __typename
  }
  durationMinutes
  eventTimestamp
  skillType
  __typename
}

fragment ActivitySessionSkillLevels on SkillLevelChange {
  id
  before
  after
  __typename
}`;

async function fetchKhanActivities(page, kaid) {
  const allSessions = [];
  let cursor = null;
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  do {
    const batch = await page.evaluate(
      async ({ query, kaid, startDate, endDate, cursor }) => {
        const resp = await fetch(
          "/api/internal/graphql/ActivitySessionsV2Query?lang=en&app=khanacademy&_=" + Date.now(),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operationName: "ActivitySessionsV2Query",
              variables: {
                studentKaid: kaid,
                startDate,
                endDate,
                courseType: null,
                activityKind: null,
                pageSize: 50,
                after: cursor,
              },
              query,
            }),
          }
        );
        const data = await resp.json();
        const activityLog = data?.data?.user?.activityLogV2;
        return {
          sessions: activityLog?.activitySessions?.sessions || [],
          nextCursor: activityLog?.activitySessions?.pageInfo?.nextCursor || null,
        };
      },
      { query: ACTIVITY_QUERY, kaid, startDate, endDate, cursor }
    );

    allSessions.push(...batch.sessions);
    cursor = batch.nextCursor;
  } while (cursor);

  // Normalize sessions into flat activity records
  return allSessions.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle || null,
    activityKind: s.activityKind?.id || null,
    durationMinutes: s.durationMinutes || 0,
    eventTimestamp: s.eventTimestamp,
    skillType: s.skillType || null,
    correctCount: s.correctCount ?? null,
    problemCount: s.problemCount ?? null,
    skillLevels: s.skillLevels || null,
    __typename: s.__typename,
  }));
}

async function syncKhanAccount(account) {
  const cookies = account.managed_session_payload?.cookies;
  if (!cookies?.length) {
    console.log(`  ⚠️  ${account.external_account_ref}: 没有 Session`);
    return { status: "skipped", reason: "no_session" };
  }

  let chromium;
  try {
    const pw = await import("playwright-extra");
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
    pw.chromium.use(StealthPlugin());
    chromium = pw.chromium;
  } catch {
    console.error("❌ Playwright 未安装");
    return { status: "error", reason: "playwright_not_installed" };
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: ".khanacademy.org",
      path: "/",
    }))
  );

  const page = await context.newPage();

  try {
    await page.goto("https://www.khanacademy.org/profile/me/progress", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      throw new Error("Session expired");
    }

    // Wait for the page to fully load and API calls to complete
    await page.waitForTimeout(3000);

    // Get KAID from cookies (stored in cookie name or value)
    let kaid = null;
    const kaidCookie = cookies.find((c) => c.name.startsWith("returning_login_kaid_"));
    if (kaidCookie) {
      kaid = "kaid_" + kaidCookie.name.replace("returning_login_kaid_", "");
    }
    if (!kaid) {
      // fallback: extract from page context
      kaid = await page.evaluate(() => window.__USER_PROFILE__?.kaid || null);
    }
    if (!kaid) {
      throw new Error("No KAID found in cookies or page context");
    }

    console.log(`  🌐 通过 GraphQL API 抓取学习记录...`);
    const activities = await fetchKhanActivities(page, kaid);

    console.log(`  ✅ 找到 ${activities.length} 条学习记录`);

    await browser.close();

    if (activities.length === 0) {
      console.log(`  ⚠️  ${account.external_account_ref}: 该账号最近没有活动数据`);
      return { status: "no_data", reason: "no_activities_found" };
    }

    // Deduplicate
    const seen = new Set();
    const uniqueActivities = [];
    for (const a of activities) {
      const key = `${a.title}::${a.eventTimestamp}::${a.activityKind}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueActivities.push(a);
      }
    }

    // Insert into learning_events
    let inserted = 0;
    let duplicates = 0;
    const householdTimeZone = "Asia/Shanghai";

    for (const activity of uniqueActivities) {
      const ts = activity.eventTimestamp ? new Date(activity.eventTimestamp) : new Date();
      const localDateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: householdTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(ts);

      const eventData = {
        child_id: account.child_id,
        platform: "khan-academy",
        platform_account_id: account.id,
        occurred_at: ts.toISOString(),
        local_date_key: localDateKey,
        event_type: "skill_practice",
        title: activity.title,
        subject: activity.subtitle || null,
        duration_minutes: activity.durationMinutes || null,
        score:
          activity.correctCount !== null && activity.problemCount !== null && activity.problemCount > 0
            ? activity.correctCount / activity.problemCount
            : null,
        completion_state: "completed",
        source_ref: `khan:${activity.id}`,
        raw_payload: activity,
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
    await browser.close();
    const isSessionExpired =
      err.message === "Session expired" || err.message?.includes("Session expired");

    if (isSessionExpired) {
      const failCount = account._loginFailCount || 0;
      if (failCount >= 3) {
        console.error(`  ❌ 连续 ${failCount} 次登录失败，已停止重试`);
        await supabase
          .from("platform_accounts")
          .update({
            status: "attention_required",
            last_sync_error_summary: `Too many login failures (${failCount}), blocked for safety`,
          })
          .eq("id", account.id);
        return { status: "error", error: "Login rate-limited for safety" };
      }

      const backoff = [60, 300, 900][failCount];
      console.log(`  🔄 Session 过期，${backoff}s 退避后尝试自动重新登录...`);
      await new Promise((r) => setTimeout(r, backoff * 1000));

      try {
        const dbCreds = getDbCredentials(account);
        const creds = dbCreds ?? KHAN_CREDENTIALS;
        if (!creds?.username || !creds?.password) {
          throw new Error("No credentials available (neither DB nor .env.local)");
        }
        console.log(`  🔑 使用${dbCreds ? "数据库" : ".env.local"}凭据重新登录...`);
        const { autoLoginKhan } = await import("../src/lib/khan-auto-login.mjs");
        const loginResult = await autoLoginKhan(creds.username, creds.password);
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
        return syncKhanAccount(account);
      } catch (reloginErr) {
        account._loginFailCount = failCount + 1;
        console.error(`  ❌ 自动登录失败 (${account._loginFailCount}/3): ${reloginErr.message}`);
        console.log(
          `  💡 请手动运行: npm run session:collect -- --platform=khan-academy`
        );
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
  console.log("🔍 查询 Khan Academy 账号...\n");

  const { data: accounts, error } = await supabase
    .from("platform_accounts")
    .select("id, child_id, external_account_ref, status, managed_session_payload, login_credentials_encrypted, auto_login_enabled")
    .eq("platform", "khan-academy");

  if (error) {
    console.error("❌ 查询失败:", error.message);
    process.exit(1);
  }

  if (!accounts || accounts.length === 0) {
    console.log("⚠️  数据库中没有 Khan Academy 账号");
    process.exit(0);
  }

  console.log(`找到 ${accounts.length} 个账号\n`);

  for (const account of accounts) {
    console.log(`🔄 同步: ${account.external_account_ref}`);
    const result = await syncKhanAccount(account);
    console.log(`   结果: ${result.status}\n`);
  }

  console.log("✅ 同步完成");
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
