#!/usr/bin/env node

/**
 * Khan Academy API 探测脚本
 *
 * 用 Playwright 拦截所有网络请求，找出 Khan Academy 加载学习记录时
 * 调用的真实 API endpoint、GraphQL query hash、headers 等参数。
 *
 * 运行一次后，后续同步就可以用纯 Node.js fetch，不需要浏览器。
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少环境变量。请确保 .env.local 中有 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function discoverApi() {
  console.log("🔍 获取 Khan Academy Session...");

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
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Check if Playwright is installed
  let chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch {
    console.error("❌ Playwright 未安装。请先运行:");
    console.error("   npm install playwright");
    console.error("   npx playwright install chromium");
    process.exit(1);
  }

  console.log("🚀 启动浏览器并拦截网络请求...\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  const apiCalls = [];

  // Intercept all network requests
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/api/") ||
      url.includes("/graphql") ||
      url.includes("/ajax/") ||
      url.includes("/progress") ||
      url.includes("/analytics")
    ) {
      apiCalls.push({
        url,
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
        resourceType: request.resourceType(),
      });
    }
  });

  // Intercept responses to capture response bodies for API calls
  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("/api/") ||
      url.includes("/graphql") ||
      url.includes("/ajax/") ||
      url.includes("/progress")
    ) {
      const existing = apiCalls.find((c) => c.url === url);
      if (existing) {
        try {
          const body = await response.text();
          existing.responseStatus = response.status();
          existing.responseBody = body;
        } catch {
          // ignore
        }
      }
    }
  });

  // Set cookies before navigation
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

  // Wait a bit for any lazy-loaded data
  await page.waitForTimeout(3000);

  console.log(`✅ 拦截到 ${apiCalls.length} 个 API 请求\n`);

  // Save raw data for inspection
  fs.writeFileSync("/tmp/khan-api-calls.json", JSON.stringify(apiCalls, null, 2));
  console.log("📄 完整请求记录已保存到 /tmp/khan-api-calls.json\n");

  // Analyze and display findings
  const jsonApis = apiCalls.filter(
    (c) =>
      c.responseBody &&
      (c.responseBody.trim().startsWith("{") || c.responseBody.trim().startsWith("["))
  );

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 JSON API 请求分析");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const api of jsonApis) {
    const url = new URL(api.url);
    console.log(`${api.method} ${url.pathname}${url.search}`);
    console.log(`  Status: ${api.responseStatus}`);

    if (api.postData) {
      console.log(`  POST Body: ${api.postData.slice(0, 500)}`);
    }

    try {
      const body = JSON.parse(api.responseBody);
      if (Array.isArray(body) && body.length > 0) {
        console.log(`  Response: Array[${body.length}]`);
        if (typeof body[0] === "object") {
          console.log(`  Sample keys: ${Object.keys(body[0]).join(", ")}`);
        }
      } else if (typeof body === "object" && body !== null) {
        console.log(`  Response keys: ${Object.keys(body).slice(0, 20).join(", ")}`);

        // Look for arrays that might contain activity data
        for (const [key, val] of Object.entries(body)) {
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
            console.log(`  → Array "${key}": ${val.length} items, keys: ${Object.keys(val[0]).slice(0, 10).join(", ")}`);
          }
        }
      }
    } catch {
      console.log(`  Response: ${api.responseBody.slice(0, 200)}...`);
    }

    console.log();
  }

  // Try to find the best API endpoint
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 推荐 API 端点");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const candidates = jsonApis.filter(
    (c) => c.responseStatus === 200 && c.responseBody && c.responseBody.length > 1000
  );

  if (candidates.length > 0) {
    const best = candidates.sort((a, b) => b.responseBody.length - a.responseBody.length)[0];
    console.log("最佳候选（数据量最大）:");
    console.log(`  URL: ${best.url}`);
    console.log(`  Method: ${best.method}`);
    console.log(`  Status: ${best.responseStatus}`);
    console.log(`  Response size: ${best.responseBody.length} bytes`);

    // Try to extract sample data
    try {
      const body = JSON.parse(best.responseBody);
      console.log(`\n  数据结构:`);
      console.log(JSON.stringify(body, null, 2).slice(0, 800));
    } catch {
      console.log(`\n  原始响应（前 800 字符）:`);
      console.log(best.responseBody.slice(0, 800));
    }
  } else {
    console.log("未找到有效的 JSON API 端点。可能需要进一步分析。");
  }

  await browser.close();
  console.log("\n👋 探测完成");
}

discoverApi().catch((err) => {
  console.error("❌ 错误:", err.message);
  process.exit(1);
});
