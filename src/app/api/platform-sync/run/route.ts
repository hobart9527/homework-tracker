import {
  buildPlatformSyncWindowKey,
  isPlatformSyncWindowKey,
  type PlatformSyncWindowKey,
  resolvePlatformSyncWindow,
} from "@/lib/platform-sync-schedule";
import { claimPlatformSyncJob } from "@/lib/platform-sync";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET || "";
const DEFAULT_PLATFORMS = ["ixl", "khan-academy"] as const;
const DEFAULT_HOUSEHOLD_TIME_ZONE = "Asia/Shanghai";

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronCall = cronSecret && cronSecret === CRON_SECRET;

  const supabase = isCronCall
    ? await createServiceRoleClient()
    : await createClient();

  if (!isCronCall) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const platforms = (searchParams.get("platforms") || DEFAULT_PLATFORMS.join(","))
    .split(",")
    .map((platform) => platform.trim())
    .filter(Boolean);
  const householdTimeZone =
    searchParams.get("householdTimeZone") ?? DEFAULT_HOUSEHOLD_TIME_ZONE;
  const now = new Date(searchParams.get("now") ?? Date.now());
  const requestedScheduleWindow = searchParams.get("scheduleWindow");

  if (
    requestedScheduleWindow &&
    !isPlatformSyncWindowKey(requestedScheduleWindow)
  ) {
    return NextResponse.json(
      { error: `Invalid schedule window ${requestedScheduleWindow}` },
      { status: 400 }
    );
  }

  let scheduleWindow: PlatformSyncWindowKey;

  if (requestedScheduleWindow && isPlatformSyncWindowKey(requestedScheduleWindow)) {
    scheduleWindow = requestedScheduleWindow;
  } else {
    scheduleWindow = resolvePlatformSyncWindow({
      now,
      timeZone: householdTimeZone,
    });
  }
  const windowKey =
    searchParams.get("windowKey") ??
    buildPlatformSyncWindowKey({
      now,
      timeZone: householdTimeZone,
      scheduleWindow,
    });

  const { data: accounts, error } = await supabase
    .from("platform_accounts")
    .select("*")
    .in("platform", platforms)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const account of accounts ?? []) {
    if (account.status === "attention_required") {
      results.push({
        platformAccountId: account.id,
        status: "attention_required",
      });
      continue;
    }

    const claimResult = await claimPlatformSyncJob({
      supabase: supabase as any,
      platformAccountId: account.id,
      triggerMode: "scheduled",
      windowKey,
    });

    results.push({
      platformAccountId: account.id,
      status: claimResult.status,
      jobId: claimResult.job?.id ?? null,
    });
  }

  return NextResponse.json({
    scheduleWindow,
    householdTimeZone,
    windowKey,
    totalAccounts: accounts?.length ?? 0,
    results,
  });
}
