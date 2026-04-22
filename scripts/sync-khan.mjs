#!/usr/bin/env node

/**
 * Khan Academy 学习记录同步脚本
 *
 * 通过 Playwright 打开 Khan Academy 进度页，
 * 直接从 DOM 表格中提取学习记录，写入 learning_events。
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少环境变量");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function syncKhanAccount(account) {
  const cookies = account.managed_session_payload?.cookies;
  if (!cookies?.length) {
    console.log(`  ⚠️  ${account.external_account_ref}: 没有 Session`);
    return { status: "skipped", reason: "no_session" };
  }

  let chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch {
    console.error("❌ Playwright 未安装。请先运行: npm install playwright && npx playwright install chromium");
    return { status: "error", reason: "playwright_not_installed" };
  }

  const browser = await chromium.launch({ headless: true });
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

    // Wait for the activity table to render
    await page.waitForTimeout(5000);

    // Scroll to trigger any lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // Extract activity data from DOM
    const activities = await page.evaluate(() => {
      const results = [];

      // Find the activity table
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll("thead th, thead td"))
          .map((th) => th.textContent?.trim().toLowerCase() || "");

        // Check if this is the activity table
        const hasActivityHeader = headers.some((h) => h.includes("activity"));
        const hasDateHeader = headers.some((h) => h.includes("date"));

        if (!hasActivityHeader || !hasDateHeader) continue;

        const rows = table.querySelectorAll("tbody tr");
        for (const row of rows) {
          const cells = row.querySelectorAll("td");
          if (cells.length < 6) continue;

          const titleEl = cells[0].querySelector("p[title]") || cells[0].querySelector("p");
          const subjectEl = cells[0].querySelectorAll("p")[1];
          const dateEl = cells[1];
          const levelEl = cells[2];
          const changeEl = cells[3];
          const correctEl = cells[4];
          const timeEl = cells[5];

          const title = titleEl?.textContent?.trim() || "";
          const subject = subjectEl?.textContent?.trim() || "";
          const dateStr = dateEl?.textContent?.trim() || "";
          const level = levelEl?.textContent?.trim() || "";
          const change = changeEl?.textContent?.trim() || "";
          const correctTotal = correctEl?.textContent?.trim() || "";
          const timeStr = timeEl?.textContent?.trim() || "";

          if (!title) continue;

          // Parse date: "Apr 22, 2026 at 4:24 PM"
          let occurredAt = null;
          if (dateStr) {
            try {
              // Try various date formats
              const date = new Date(dateStr.replace(/\bat\b/g, ''));
              if (!isNaN(date.getTime())) {
                occurredAt = date.toISOString();
              }
            } catch {
              // ignore parse errors
            }
          }
          // Fallback to current time if parsing fails
          if (!occurredAt) {
            occurredAt = new Date().toISOString();
          }

          // Parse time: "8" (minutes)
          let durationMinutes = null;
          if (timeStr && timeStr !== "–" && timeStr !== "-") {
            const match = timeStr.match(/(\d+)/);
            if (match) durationMinutes = parseInt(match[1], 10);
          }

          // Parse correct/total: "5/10" or "–"
          let correctCount = null;
          let problemCount = null;
          if (correctTotal && correctTotal !== "–" && correctTotal !== "-") {
            const match = correctTotal.match(/(\d+)\s*\/\s*(\d+)/);
            if (match) {
              correctCount = parseInt(match[1], 10);
              problemCount = parseInt(match[2], 10);
            }
          }

          results.push({
            title,
            subject,
            occurredAt,
            level: level !== "–" ? level : null,
            change: change !== "–" ? change : null,
            correctCount,
            problemCount,
            durationMinutes,
            rawDate: dateStr,
            rawTime: timeStr,
          });
        }
      }

      return results;
    });

    await browser.close();

    if (activities.length === 0) {
      console.log(`  ⚠️  ${account.external_account_ref}: 页面上没有找到活动数据`);
      return { status: "no_data", reason: "no_activities_found" };
    }

    console.log(`  ✅ 找到 ${activities.length} 条学习记录`);

    // Deduplicate by title + date + subject
    const seen = new Set();
    const uniqueActivities = [];
    for (const a of activities) {
      const key = `${a.title}::${a.occurredAt || a.rawDate}::${a.subject}`;
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
      const localDateKey = activity.occurredAt
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: householdTimeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(activity.occurredAt))
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: householdTimeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());

      const eventData = {
        child_id: account.child_id,
        platform: "khan-academy",
        platform_account_id: account.id,
        occurred_at: activity.occurredAt || new Date().toISOString(),
        local_date_key: localDateKey,
        event_type: "skill_practice",
        title: activity.title,
        subject: activity.subject || null,
        duration_minutes: activity.durationMinutes,
        score: activity.correctCount !== null && activity.problemCount !== null
          ? activity.correctCount / activity.problemCount
          : null,
        completion_state: activity.level || "completed",
        source_ref: `khan:${activity.title}:${activity.occurredAt || Date.now()}`,
        raw_payload: {
          title: activity.title,
          subject: activity.subject,
          level: activity.level,
          change: activity.change,
          correctCount: activity.correctCount,
          problemCount: activity.problemCount,
          durationMinutes: activity.durationMinutes,
          date: activity.rawDate,
          time: activity.rawTime,
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

    // Update account last_synced_at
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
    .select("id, child_id, external_account_ref, status, managed_session_payload")
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
