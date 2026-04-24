#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function extract() {
  const { data: account } = await supabase
    .from("platform_accounts")
    .select("managed_session_payload")
    .eq("platform", "khan-academy")
    .single();

  const cookies = account.managed_session_payload.cookies;

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: ".khanacademy.org",
      path: "/",
    }))
  );

  await page.goto("https://www.khanacademy.org/profile/me/progress", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Extract hash from Apollo Client's in-memory cache
  const result = await page.evaluate(() => {
    // Try to find Apollo Client instance
    let apolloClient = null;
    for (const key of Object.keys(window)) {
      const obj = window[key];
      if (obj && typeof obj === "object" && obj.query && typeof obj.query === "function") {
        apolloClient = obj;
        break;
      }
    }

    // Also check React devtools or global __APOLLO_CLIENT__
    if (!apolloClient && window.__APOLLO_CLIENT__) {
      apolloClient = window.__APOLLO_CLIENT__;
    }

    // Search for ActivitySessionsV2Query in any global state
    const results = [];
    const searchStr = "ActivitySessionsV2Query";

    // Check all script tags for query definitions with hash
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const text = script.textContent || "";
      if (text.includes(searchStr)) {
        const hashMatch = text.match(/ActivitySessionsV2Query[^}]*hash["']?\s*[:=]\s*["']?(\d+)["']?/);
        if (hashMatch) {
          results.push({ source: "script", hash: hashMatch[1] });
        }
      }
    }

    // Check window objects
    for (const key of Object.keys(window)) {
      try {
        const val = window[key];
        if (typeof val === "string" && val.includes(searchStr)) {
          const hashMatch = val.match(/ActivitySessionsV2Query[^}]*hash["']?\s*[:=]\s*["']?(\d+)["']?/);
          if (hashMatch) {
            results.push({ source: `window.${key}`, hash: hashMatch[1] });
          }
        }
      } catch {
        // ignore cross-origin errors
      }
    }

    return {
      apolloFound: !!apolloClient,
      apolloKeys: apolloClient ? Object.keys(apolloClient).slice(0, 20) : null,
      results,
      // Also try to find hash in __APOLLO_STATE__
      apolloStateKeys: window.__APOLLO_STATE__ ? Object.keys(window.__APOLLO_STATE__).slice(0, 10) : null,
    };
  });

  console.log(JSON.stringify(result, null, 2));

  // Try extracting data directly from rendered DOM
  const domData = await page.evaluate(() => {
    // Look for activity session elements
    const activityElements = document.querySelectorAll('[data-test-id*="activity"], [class*="activity"], [class*="session"]');
    return {
      activityElementCount: activityElements.length,
      sampleTexts: Array.from(activityElements).slice(0, 5).map((el) => el.textContent?.slice(0, 100)),
    };
  });

  console.log("\nDOM data:", JSON.stringify(domData, null, 2));

  await browser.close();
}

extract().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
