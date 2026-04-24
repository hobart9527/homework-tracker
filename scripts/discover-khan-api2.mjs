#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function discoverApi() {
  const { data: account, error } = await supabase
    .from("platform_accounts")
    .select("managed_session_payload")
    .eq("platform", "khan-academy")
    .single();

  if (error || !account?.managed_session_payload?.cookies) {
    console.error("❌ 没有找到 Khan Academy 账号或 Session");
    process.exit(1);
  }

  const cookies = account.managed_session_payload.cookies;

  let chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch {
    console.error("❌ Playwright 未安装");
    process.exit(1);
  }

  console.log("🚀 启动浏览器...\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Hook fetch API to capture requests
  const capturedRequests = [];

  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.__capturedRequests = [];
    window.fetch = async function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0].url;
      const options = args[1] || {};
      if (url.includes("/api/internal/graphql")) {
        window.__capturedRequests.push({
          url,
          method: options.method || "GET",
          headers: options.headers,
          body: options.body,
        });
      }
      return originalFetch.apply(this, args);
    };
  });

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

  await page.waitForTimeout(3000);

  const requests = await page.evaluate(() => window.__capturedRequests);

  console.log(`✅ 捕获到 ${requests.length} 个 GraphQL 请求\n`);

  fs.writeFileSync("/tmp/khan-graphql-requests.json", JSON.stringify(requests, null, 2));
  console.log("📄 已保存到 /tmp/khan-graphql-requests.json\n");

  const activityQuery = requests.find((r) => r.url.includes("ActivitySessionsV2Query"));
  if (activityQuery) {
    console.log("=== ActivitySessionsV2Query ===");
    console.log("URL:", activityQuery.url);
    console.log("Method:", activityQuery.method);
    console.log("Body:", activityQuery.body);
  }

  const profileQuery = requests.find((r) => r.url.includes("getFullUserProfile"));
  if (profileQuery) {
    console.log("\n=== getFullUserProfile ===");
    console.log("URL:", profileQuery.url);
    console.log("Method:", profileQuery.method);
    console.log("Body:", profileQuery.body);
  }

  await browser.close();
}

discoverApi().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
