import {
  normalizePlatformLearningEvent,
  supportsRawPlatformImport,
} from "@/lib/platform-adapters";
import {
  claimPlatformSyncJob,
  completePlatformSyncJob,
  markPlatformAccountAttentionRequired,
} from "@/lib/platform-sync";
import {
  executeManagedSessionSync,
  importNormalizedEvent,
  supportsManagedSessionSync,
} from "@/lib/platform-sync-execution";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_HOUSEHOLD_TIME_ZONE = "Asia/Shanghai";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const platformAccountId = payload.platformAccountId;
  const householdTimeZone =
    payload.householdTimeZone || DEFAULT_HOUSEHOLD_TIME_ZONE;
  const fetchMode = payload.fetchMode;
  const eventPayload = payload.event;
  const rawEventPayload = payload.rawEvent;
  const windowKey =
    payload.windowKey ??
    new Date(
      eventPayload?.occurredAt ?? rawEventPayload?.occurredAt ?? Date.now()
    )
      .toISOString()
      .slice(0, 16);

  if (!platformAccountId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const { data: account, error: accountError } = await supabase
    .from("platform_accounts")
    .select("*")
    .eq("id", platformAccountId)
    .single();

  if (accountError || !account) {
    return NextResponse.json(
      { error: "Platform account not found" },
      { status: 404 }
    );
  }

  const { data: child, error: childError } = await supabase
    .from("children")
    .select("id, parent_id")
    .eq("id", account.child_id)
    .eq("parent_id", session.user.id)
    .single();

  if (childError || !child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  const normalizedEvent =
    eventPayload ??
    normalizePlatformLearningEvent({
      platform: account.platform,
      rawEvent: rawEventPayload ?? null,
    });

  const usingManagedSessionFetch =
    fetchMode === "managed_session" &&
    supportsManagedSessionSync(account as any);

  if (
    fetchMode === "managed_session" &&
    !usingManagedSessionFetch &&
    (account.platform === "epic" || account.platform === "raz-kids")
  ) {
    return NextResponse.json(
      {
        error: `${account.platform} managed session requires activityUrl in managed_session_payload`,
      },
      { status: 400 }
    );
  }

  if (rawEventPayload && !eventPayload && !supportsRawPlatformImport(account.platform)) {
    return NextResponse.json(
      { error: `Raw event import not supported for platform ${account.platform}` },
      { status: 400 }
    );
  }

  const hasInvalidNormalizedEvent =
    !normalizedEvent?.occurredAt ||
    !normalizedEvent?.eventType ||
    !normalizedEvent?.title ||
    !normalizedEvent?.sourceRef;

  if (!usingManagedSessionFetch && hasInvalidNormalizedEvent) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const claimResult = await claimPlatformSyncJob({
    supabase: supabase as any,
    platformAccountId: account.id,
    triggerMode: "manual",
    windowKey,
  });

  if (claimResult.status === "duplicate") {
    return NextResponse.json({
      jobStatus: "duplicate",
      jobId: null,
      ingestStatus: null,
      learningEventId: null,
      localDateKey: null,
      homeworkResults: [],
    });
  }

  try {
    if (usingManagedSessionFetch) {
      const result = await executeManagedSessionSync({
        supabase: supabase as any,
        account: account as any,
        householdTimeZone,
        jobId: String(claimResult.job?.id),
      });

      return NextResponse.json({
        jobStatus:
          result.status === "attention_required" || result.status === "failed"
            ? result.status
            : claimResult.status,
        jobId: claimResult.job?.id ?? null,
        ...result,
      });
    }

    const result = await importNormalizedEvent({
      supabase: supabase as any,
      account: account as any,
      householdTimeZone,
      normalizedEvent: normalizedEvent as any,
    });

    await completePlatformSyncJob({
      supabase: supabase as any,
      jobId: String(claimResult.job?.id),
      platformAccountId: account.id,
      rawSummary: {
        ingestStatus: result.ingestStatus,
        localDateKey: result.localDateKey,
        autoCheckinCount: result.homeworkResults.length,
      },
    });

    return NextResponse.json({
      jobStatus: claimResult.status,
      jobId: claimResult.job?.id ?? null,
      ...result,
    });
  } catch (error) {
    await markPlatformAccountAttentionRequired({
      supabase: supabase as any,
      jobId: String(claimResult.job?.id),
      platformAccountId: account.id,
      errorSummary:
        error instanceof Error ? error.message : "Manual import failed",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual import failed" },
      { status: 500 }
    );
  }
}
