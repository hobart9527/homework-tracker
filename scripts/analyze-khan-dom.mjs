#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyze() {
  const { data: account } = await supabase
    .from("platform_accounts")
    .select("managed_session_payload")
    .eq("platform", "khan-academy")
    .single();

  const cookies = account.managed_session_payload.cookies;

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: ".khanacademy.org",
      path: "/",
    }))
  );

  console.log("🌐 访问 Khan Academy 进度页...");
  await page.goto("https://www.khanacademy.org/profile/me/progress", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  // Wait for JS to render
  await page.waitForTimeout(5000);

  // Scroll to trigger lazy loading
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(3000);

  // Get full page HTML
  const html = await page.content();
  fs.writeFileSync("/tmp/khan-progress-full.html", html);
  console.log("📄 完整 HTML 已保存到 /tmp/khan-progress-full.html\n");

  // Analyze DOM structure
  const analysis = await page.evaluate(() => {
    const results = {
      // Look for tables, lists, cards that might contain activity data
      tables: document.querySelectorAll("table").length,
      rows: document.querySelectorAll("tr").length,
      listItems: document.querySelectorAll("li").length,
      divs: document.querySelectorAll("div").length,

      // Look for text content that matches activity patterns
      allText: document.body.innerText.slice(0, 2000),

      // Check for React root and data attributes
      reactRoot: document.getElementById("__next") ? true : false,
      reactRootId: document.getElementById("react-root") ? true : false,

      // Search for specific class patterns
      activityClasses: [],
      sessionClasses: [],

      // Find all elements with data-test-id or similar
      testIds: [],
    };

    // Collect class names that might be activity-related
    const allElements = document.querySelectorAll("*");
    const classSet = new Set();
    for (const el of allElements) {
      if (el.className && typeof el.className === "string") {
        const classes = el.className.split(/\s+/);
        for (const c of classes) {
          if (
            c.toLowerCase().includes("activity") ||
            c.toLowerCase().includes("session") ||
            c.toLowerCase().includes("skill") ||
            c.toLowerCase().includes("progress") ||
            c.toLowerCase().includes("mastery")
          ) {
            classSet.add(c);
          }
        }
      }
      if (el.dataset && el.dataset.testId) {
        results.testIds.push(el.dataset.testId);
      }
    }
    results.activityClasses = Array.from(classSet).slice(0, 30);

    return results;
  });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 DOM 结构分析");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Tables:", analysis.tables);
  console.log("Rows:", analysis.rows);
  console.log("List items:", analysis.listItems);
  console.log("Divs:", analysis.divs);
  console.log("React root (__next):", analysis.reactRoot);
  console.log("\n相关 class names:", analysis.activityClasses.join(", "));
  console.log("\ndata-test-id:", analysis.testIds.slice(0, 20).join(", "));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📝 页面文本内容（前 2000 字符）");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(analysis.allText);

  await browser.close();
}

analyze().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
