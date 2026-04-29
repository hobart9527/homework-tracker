#!/usr/bin/env node

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

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildCookieHeader(cookies) {
  if (!cookies?.length) {
    return null;
  }

  return cookies
    .filter((cookie) => cookie?.name && typeof cookie?.value === "string")
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function extractBootstrapJson(body) {
  const fixedScriptMatch = body.match(
    /<script[^>]*id=["']__RAZ_ACTIVITY_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );

  if (fixedScriptMatch?.[1]) {
    return fixedScriptMatch[1].trim();
  }

  return body.trim();
}

function looksLikeRazKidsActivity(value) {
  const hasTitle =
    typeof value.title === "string" ||
    typeof value.bookTitle === "string" ||
    typeof value.resourceTitle === "string" ||
    typeof value.name === "string";
  const hasTimestamp =
    typeof value.occurredAt === "string" ||
    typeof value.timestamp === "string" ||
    typeof value.completedAt === "string" ||
    typeof value.date === "string" ||
    typeof value.activityDate === "string";

  return hasTitle && hasTimestamp;
}

function findRazKidsActivityArray(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const objectItems = value.filter(
      (item) => !!item && typeof item === "object" && !Array.isArray(item)
    );
    return objectItems.some(looksLikeRazKidsActivity) ? objectItems : null;
  }

  const candidateKeys = [
    "activityReport",
    "activities",
    "activity",
    "activityItems",
    "studentActivity",
    "results",
    "items",
    "entries",
  ];

  for (const key of candidateKeys) {
    const candidate = findRazKidsActivityArray(value[key]);
    if (candidate) {
      return candidate;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const candidate = findRazKidsActivityArray(nestedValue);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function parseRazKidsActivityResponse(body) {
  const parsed = tryParseJson(extractBootstrapJson(body));
  const activities = findRazKidsActivityArray(parsed);

  if (!activities) {
    throw new Error("Unable to parse Raz-Kids activity payload");
  }

  return activities.map((activity) => ({
    occurredAt: String(
      activity.occurredAt ??
        activity.timestamp ??
        activity.completedAt ??
        activity.activityDate ??
        activity.date
    ),
    activityId:
      typeof activity.activityId === "string"
        ? activity.activityId
        : typeof activity.id === "string"
          ? activity.id
          : typeof activity.sessionId === "string"
            ? activity.sessionId
            : typeof activity.resourceId === "string"
              ? activity.resourceId
              : null,
    title: String(
      activity.title ??
        activity.bookTitle ??
        activity.resourceTitle ??
        activity.name
    ),
    level:
      typeof activity.level === "string"
        ? activity.level
        : typeof activity.readingLevel === "string"
          ? activity.readingLevel
          : null,
    durationSeconds:
      typeof activity.durationSeconds === "number"
        ? activity.durationSeconds
        : typeof activity.timeSpentSeconds === "number"
          ? activity.timeSpentSeconds
          : typeof activity.durationMinutes === "number"
            ? activity.durationMinutes * 60
            : typeof activity.timeSpentMinutes === "number"
              ? activity.timeSpentMinutes * 60
              : null,
  }));
}

async function fetchRazKidsManagedSessionActivities(payload) {
  const cookieHeader = buildCookieHeader(payload?.cookies);
  const activityUrl = payload?.activityUrl?.trim();

  if (!cookieHeader) {
    throw new Error("Managed Raz-Kids session is missing");
  }

  if (!activityUrl) {
    throw new Error("Managed Raz-Kids session is missing activity URL");
  }

  const response = await fetch(activityUrl, {
    headers: {
      cookie: cookieHeader,
      ...(payload?.headers ?? {}),
    },
  });

  const body = await response.text();

  if (
    response.status === 401 ||
    /kids login|teacher training|student portal/i.test(body)
  ) {
    throw new Error("Managed Raz-Kids session expired");
  }

  return parseRazKidsActivityResponse(body);
}

async function main() {
  console.log("🔍 查询数据库中的 Raz-Kids 账号...\n");

  const { data: accounts, error } = await supabase
    .from("platform_accounts")
    .select("*, children(name)")
    .eq("platform", "raz-kids");

  if (error) {
    console.error("❌ 查询失败:", error.message);
    process.exit(1);
  }

  if (!accounts?.length) {
    console.log("⚠️  数据库中没有 Raz-Kids 账号绑定记录。");
    process.exit(0);
  }

  for (const account of accounts) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`账号: ${account.external_account_ref}`);
    console.log(`孩子: ${account.children?.name ?? "未知"}`);
    console.log(`状态: ${account.status}`);
    console.log(
      `activityUrl: ${account.managed_session_payload?.activityUrl ?? "N/A"}`
    );

    if (!account.managed_session_payload) {
      console.log("⚠️  该账号没有配置 Session，跳过。");
      continue;
    }

    try {
      const activities = await fetchRazKidsManagedSessionActivities({
        managedSessionPayload: account.managed_session_payload,
      });

      console.log(`✅ 成功抓取 ${activities.length} 条 Raz-Kids 记录`);
      activities.slice(0, 5).forEach((activity, index) => {
        console.log(`   ${index + 1}. ${activity.title}`);
        console.log(`      时间: ${activity.occurredAt}`);
        console.log(`      级别: ${activity.level ?? "N/A"}`);
        console.log(
          `      时长: ${
            activity.durationSeconds
              ? Math.round(activity.durationSeconds / 60) + " 分钟"
              : "N/A"
          }`
        );
      });
    } catch (error) {
      console.log(`❌ 抓取失败: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error("❌", error.message);
  process.exit(1);
});
