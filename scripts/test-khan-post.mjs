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
  const cookieHeader = cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 14);
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const cacheBuster = `${dateStr}-1451-${randomId}_${timestamp}`;

  const url = `https://www.khanacademy.org/api/internal/graphql/ActivitySessionsV2Query?lang=en&app=khanacademy&_=${cacheBuster}`;

  console.log("Testing POST with empty body...");
  console.log("URL:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-ka-fkey": "1",
      Referer: "https://www.khanacademy.org/profile/me/progress",
    },
    body: "", // empty body
  });

  const body = await res.text();
  console.log("Status:", res.status);
  console.log("Length:", body.length);

  try {
    const parsed = JSON.parse(body);
    const sessions = parsed.data?.user?.activityLogV2?.activitySessions?.sessions;
    if (sessions) {
      console.log("\n✅ SUCCESS! Found", sessions.length, "sessions");
      sessions.forEach((s, i) => {
        console.log(`\n  ${i + 1}. ${s.title}`);
        console.log(`     Type: ${s.activityKind?.id || "N/A"}`);
        console.log(`     Time: ${s.eventTimestamp}`);
        console.log(`     Duration: ${s.durationMinutes} min`);
        console.log(`     Subject: ${s.subtitle}`);
      });
    } else if (parsed.errors) {
      console.log("\n❌ Errors:", JSON.stringify(parsed.errors, null, 2));
    }
  } catch {
    console.log("Not JSON:", body.slice(0, 500));
  }
}

test().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
