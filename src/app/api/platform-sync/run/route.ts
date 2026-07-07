import {
  buildPlatformSyncWindowKey,
  isPlatformSyncWindowKey,
  type PlatformSyncWindowKey,
  resolvePlatformSyncWindow,
} from "@/lib/platform-sync-schedule";
import { claimPlatformSyncJob, restartPlatformSyncJob } from "@/lib/platform-sync";
import {
  executeManagedSessionSync,
  supportsManagedSessionSync,
} from "@/lib/platform-sync-execution";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const DEFAULT_PLATFORMS = ["ixl", "raz-kids", "epic"] as const;
const DEFAULT_HOUSEHOLD_TIME_ZONE = "Asia/Shanghai";

export async function GET(request: Request) {
  const limited = await checkRateLimit(request, 10, 60_000);
  if (limited) return limited;

  const cronSecret = request.headers.get("x-cron-secret");
  const isCronCall = !!cronSecret && !!CRON_SECRET && cronSecret === CRON_SECRET;

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
    .select("id, child_id, platform, status, managed_session_payload, auto_login_enabled, login_credentials_encrypted, external_account_ref")
    .in("platform", platforms)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  const processedAccountIds = new Set<string>();

  for (const account of accounts ?? []) {
    processedAccountIds.add(account.id);

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

    if (claimResult.status === "duplicate") {
      results.push({
        platformAccountId: account.id,
        status: "duplicate",
        jobId: null,
      });
      continue;
    }

    if (account.status === "active" && supportsManagedSessionSync(account as any)) {
      let executionResult;
      try {
        executionResult = await executeManagedSessionSync({
          supabase: supabase as any,
          account: account as any,
          householdTimeZone,
          jobId: String(claimResult.job?.id),
        });
      } catch (error) {
        const errorSummary =
          error instanceof Error ? error.message : "Managed session sync crashed";
        try {
          await (supabase as any)
            .from("platform_sync_jobs")
            .update({
              status: "failed",
              error_summary: errorSummary,
              finished_at: new Date().toISOString(),
            })
            .eq("id", claimResult.job?.id);
        } catch {
          // Best-effort
        }
        executionResult = { status: "crashed", error: errorSummary };
      }

      results.push({
        platformAccountId: account.id,
        jobId: claimResult.job?.id ?? null,
        ...executionResult,
      });
      continue;
    }

    results.push({
      platformAccountId: account.id,
      status: claimResult.status,
      jobId: claimResult.job?.id ?? null,
    });
  }

  const { data: retryJobs, error: retryJobsError } = await supabase
    .from("platform_sync_jobs")
    .select("id, platform_account_id, retry_count")
    .eq("status", "failed")
    .lte("next_retry_at", now.toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(50);

  if (retryJobsError) {
    return NextResponse.json({ error: retryJobsError.message }, { status: 500 });
  }

  for (const retryJob of retryJobs ?? []) {
    const platformAccountId = String(retryJob.platform_account_id);

    if (processedAccountIds.has(platformAccountId)) {
      continue;
    }

    const { data: retryAccount, error: retryAccountError } = await supabase
      .from("platform_accounts")
      .select("*")
      .eq("id", platformAccountId)
      .single();

    if (retryAccountError || !retryAccount) {
      results.push({
        platformAccountId,
        retriedJobId: retryJob.id,
        status: "failed",
        error: "Platform account not found for retry",
      });
      continue;
    }

    if (
      !supportsManagedSessionSync(retryAccount as any) ||
      retryAccount.status === "attention_required"
    ) {
      results.push({
        platformAccountId,
        retriedJobId: retryJob.id,
        status: "skipped",
      });
      continue;
    }

    await restartPlatformSyncJob({
      supabase: supabase as any,
      jobId: String(retryJob.id),
      retryCount: Number(retryJob.retry_count ?? 0),
    });

    const executionResult = await executeManagedSessionSync({
      supabase: supabase as any,
      account: retryAccount as any,
      householdTimeZone,
      jobId: String(retryJob.id),
    });
    // retry loop wrapped in try/catch — errors from executeManagedSessionSync are handled by inner try/catch above.
    // This await is safe because the inner catch always returns a result object rather than throwing.

    results.push({
      platformAccountId,
      retriedJobId: retryJob.id,
      ...executionResult,
    });
  }

  return NextResponse.json({
    scheduleWindow,
    householdTimeZone,
    windowKey,
    totalAccounts: accounts?.length ?? 0,
    retryJobCount: retryJobs?.length ?? 0,
    results,
  });
}
