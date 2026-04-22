#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * IXL 同步测试脚本
 *
 * 查询数据库中的 IXL 账号，测试 Session 有效性，并展示抓取到的学习记录格式。
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少环境变量。请确保 .env.local 中有:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL");
  console.error("   SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
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
  if (!cookies?.length) {
    throw new Error("Missing cookies in session payload");
  }

  const cookieHeader = cookies
    .filter((c) => c?.name && c?.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  if (!cookieHeader) {
    throw new Error("No valid cookies found");
  }

  console.log("\n🍪 Cookie Header:", cookieHeader.slice(0, 80) + "...");

  const activities = [];

  for (const subject of IXL_SUBJECTS) {
    const url = new URL("https://www.ixl.com/analytics/student-usage/run");
    url.searchParams.set("subjects", subject.queryValue);

    const response = await fetch(String(url), {
      headers: {
        cookie: cookieHeader,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const body = await response.text();

    if (response.status === 401 || isIxlLoginPage(body)) {
      throw new Error("Session expired or invalid — IXL returned login page");
    }

    if (response.status === 404) {
      throw new Error("IXL usage details page was not found");
    }

    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("Could not parse IXL response as JSON");
    }

    const sessions = Array.isArray(parsed?.table) ? parsed.table : null;
    if (!sessions) {
      console.log("\n📄 Raw response preview (first 2000 chars):");
      console.log(body.slice(0, 2000));
      throw new Error("No usage table found in response");
    }

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
            skillId:
              skill.skillCode ?? skill.permacode ?? skill.skill ?? "unknown",
            skillName: skill.skillName ?? "Unknown",
            subject: subject.label,
            scorePercent:
              typeof skill.score === "number" ? skill.score : null,
            durationSeconds:
              typeof skill.secondsSpent === "number" ? skill.secondsSpent : null,
            sessionId: `${practiceSession}:${skill.skillCode ?? skill.permacode ?? skill.skill ?? "unknown"}`,
          }));
      })
    );
  }

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

async function main() {
  console.log("🔍 查询数据库中的 IXL 账号...\n");

  const { data: accounts, error } = await supabase
    .from("platform_accounts")
    .select("*, children(name, parent_id)")
    .eq("platform", "ixl");

  if (error) {
    console.error("❌ 查询失败:", error.message);
    process.exit(1);
  }

  if (!accounts || accounts.length === 0) {
    console.log("⚠️  数据库中没有 IXL 账号绑定记录。");
    console.log("   请先在应用中绑定一个 IXL 账号（手动 Session 模式），然后重试。");
    process.exit(0);
  }

  console.log(`✅ 找到 ${accounts.length} 个 IXL 账号:\n`);

  for (const account of accounts) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`账号: ${account.external_account_ref}`);
    console.log(`孩子: ${account.children?.name ?? "未知"}`);
    console.log(`状态: ${account.status}`);
    console.log(`模式: ${account.auth_mode}`);
    console.log(`自动登录: ${account.auto_login_enabled ? "是" : "否"}`);
    console.log(
      `Session: ${account.managed_session_payload ? "已配置" : "未配置"}`
    );
    console.log(
      `Session 捕获时间: ${account.managed_session_captured_at ?? "N/A"}`
    );

    if (!account.managed_session_payload) {
      console.log("\n⚠️  该账号没有配置 Session，跳过同步测试。");
      continue;
    }

    try {
      console.log("\n🌐 正在抓取 IXL 学习记录...");
      const activities = await fetchIxlActivities(account.managed_session_payload);

      console.log(`\n✅ 成功抓取 ${activities.length} 条学习记录:\n`);

      if (activities.length === 0) {
        console.log("   （没有最近的学习记录）");
      } else {
        activities.slice(0, 5).forEach((activity, i) => {
          console.log(`   ${i + 1}. ${activity.skillName}`);
          console.log(`      时间: ${activity.occurredAt}`);
          console.log(`      科目: ${activity.subject ?? "N/A"}`);
          console.log(`      得分: ${activity.scorePercent ?? "N/A"}%`);
          console.log(
            `      时长: ${
              activity.durationSeconds
                ? Math.round(activity.durationSeconds / 60) + " 分钟"
                : "N/A"
            }`
          );
          console.log(`      Skill ID: ${activity.skillId}`);
          console.log();
        });

        if (activities.length > 5) {
          console.log(`   ... 还有 ${activities.length - 5} 条记录未显示`);
        }
      }

      // Show the normalized format that would be stored
      console.log("\n📋 标准化后的数据格式（存入 learning_events 前）:");
      const sample = activities[0];
      if (sample) {
        console.log(
          JSON.stringify(
            {
              childId: account.child_id,
              platform: "ixl",
              platformAccountId: account.id,
              occurredAt: sample.occurredAt,
              eventType: "skill_practice",
              title: sample.skillName,
              subject: sample.subject,
              durationMinutes: sample.durationSeconds
                ? Math.round(sample.durationSeconds / 60)
                : null,
              score:
                sample.scorePercent === null || sample.scorePercent === undefined
                  ? null
                  : sample.scorePercent / 100,
              completionState: "completed",
              sourceRef:
                sample.sessionId ??
                `ixl:${sample.subject ?? "unknown"}:${sample.skillId}:${sample.occurredAt.slice(0, 10)}`,
              rawPayload: { ...sample, fetchedFrom: "ixl_activity_page" },
            },
            null,
            2
          )
        );
      }
    } catch (err) {
      console.log(`\n❌ 抓取失败: ${err.message}`);
      if (err.message.includes("Session expired")) {
        console.log("\n💡 提示: Session 已过期，需要重新获取。");
        console.log("   运行: npm run session:collect -- --platform=ixl");
      }
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("测试完成。");
}

main().catch((err) => {
  console.error("❌ 错误:", err.message);
  process.exit(1);
});
