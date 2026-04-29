#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
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

  // Wait for JS to render and fetch data
  await page.waitForTimeout(3000);

  // Execute fetch in browser context to see what works
  const result = await page.evaluate(async () => {
    try {
      // First, try to find what query Khan uses internally
      const url = new URL(window.location.href);
      const kaid = url.pathname.split("/").pop() || "me";

      const testUrls = [
        `/api/internal/graphql/ActivitySessionsV2Query?lang=en&app=khanacademy&_=${Date.now()}`,
      ];

      const results = [];
      for (const u of testUrls) {
        try {
          const res = await fetch(u, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
            credentials: "same-origin",
          });
          const body = await res.text();
          results.push({
            url: u,
            status: res.status,
            bodyPreview: body.slice(0, 500),
            isJson: body.trim().startsWith("{"),
          });
        } catch (e) {
          results.push({ url: u, error: e.message });
        }
      }

      return results;
    } catch (e) {
      return [{ error: e.message }];
    }
  });

  console.log("Browser fetch results:");
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
}

test().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
