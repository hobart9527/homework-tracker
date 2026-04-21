import {
  loadAutoCheckinContext,
  syncLearningEventAutoCheckins,
} from "@/lib/learning-event-auto-checkins";
import { runIxlManagedSessionSync } from "@/lib/platform-adapters/ixl-connector";
import { IxlManagedSessionError } from "@/lib/platform-adapters/ixl-fetch";
import { runKhanManagedSessionSync } from "@/lib/platform-adapters/khan-connector";
import { KhanManagedSessionError } from "@/lib/platform-adapters/khan-fetch";
import {
  completePlatformSyncJob,
  markPlatformSyncJobFailed,
  markPlatformAccountAttentionRequired,
} from "@/lib/platform-sync";
import { decryptCredential } from "@/lib/crypto";
import { simulateIxlLogin } from "@/lib/platform-adapters/ixl-auth";
import { simulateKhanLogin } from "@/lib/platform-adapters/khan-auth";
import type { LearningEventInput } from "@/lib/learning-events";
import type { Json } from "@/lib/supabase/types";

type SupabaseLike = {
  from: (table: string) => {
    select?: (columns?: string) => {
      eq: (column: string, value: string) => unknown;
      in?: (column: string, values: string[]) => {
        order: (
          column: string,
          options: { ascending: boolean }
        ) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    update?: (
      payload: Record<string, unknown>
    ) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
    insert?: (payload: Record<string, unknown>) => {
      select: () => {
        single: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type PlatformAccount = {
  id: string;
  child_id: string;
  platform: LearningEventInput["platform"];
  managed_session_payload?: Record<string, unknown> | null;
  managed_session_expires_at?: string | null;
  auto_login_enabled?: boolean | null;
  login_credentials_encrypted?: string | null;
};

type NormalizedEvent = {
  occurredAt: string;
  eventType: string;
  title: string;
  subject?: string | null;
  durationMinutes?: number | null;
  score?: number | null;
  completionState?: string | null;
  sourceRef: string;
  rawPayload?: Json;
};

function getManagedSessionExpiredError(
  platform: PlatformAccount["platform"]
) {
  if (platform === "ixl") {
    return new IxlManagedSessionError("Managed IXL session expired");
  }

  return new KhanManagedSessionError("Managed Khan session expired");
}

function isManagedSessionExpired(account: PlatformAccount) {
  if (!account.managed_session_expires_at) {
    return false;
  }

  const expiresAt = Date.parse(account.managed_session_expires_at);

  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= Date.now();
}

export async function importNormalizedEvent(input: {
  supabase: SupabaseLike;
  account: PlatformAccount;
  householdTimeZone: string;
  normalizedEvent: NormalizedEvent;
}) {
  const localDateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.householdTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(input.normalizedEvent.occurredAt));

  const context = await loadAutoCheckinContext({
    supabase: input.supabase as any,
    childId: input.account.child_id,
    localDateKey,
  });

  return syncLearningEventAutoCheckins({
    supabase: input.supabase as any,
    householdTimeZone: input.householdTimeZone,
    event: {
      childId: input.account.child_id,
      platform: input.account.platform,
      platformAccountId: input.account.id,
      occurredAt: input.normalizedEvent.occurredAt,
      eventType: input.normalizedEvent.eventType,
      title: input.normalizedEvent.title,
      subject: input.normalizedEvent.subject ?? null,
      durationMinutes: input.normalizedEvent.durationMinutes ?? null,
      score: input.normalizedEvent.score ?? null,
      completionState: input.normalizedEvent.completionState ?? null,
      sourceRef: input.normalizedEvent.sourceRef,
      rawPayload: input.normalizedEvent.rawPayload ?? {},
    },
    candidateHomeworks: context.candidateHomeworks,
    existingCheckInsByHomeworkId: context.existingCheckInsByHomeworkId,
  });
}

async function tryAutoLoginRefresh(
  supabase: SupabaseLike,
  account: PlatformAccount
): Promise<boolean> {
  if (!account.auto_login_enabled || !account.login_credentials_encrypted) {
    return false;
  }

  const key = process.env.PLATFORM_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    return false;
  }

  let credentials: { username: string; password: string };
  try {
    const decrypted = decryptCredential(account.login_credentials_encrypted, key);
    credentials = JSON.parse(decrypted);
  } catch {
    return false;
  }

  const loginResult =
    account.platform === "ixl"
      ? await simulateIxlLogin(credentials.username, credentials.password)
      : account.platform === "khan-academy"
        ? await simulateKhanLogin(credentials.username, credentials.password)
        : null;

  if (!loginResult || !loginResult.success) {
    return false;
  }

  // Update the account with new session payload
  await (supabase as any)
    .from("platform_accounts")
    .update({
      managed_session_payload: { cookies: loginResult.cookies },
      managed_session_captured_at: new Date().toISOString(),
      status: "active",
      last_sync_error_summary: null,
    })
    .eq("id", account.id);

  // Mutate the local account object so downstream sync uses the new payload
  account.managed_session_payload = { cookies: loginResult.cookies };
  account.managed_session_expires_at = null;

  return true;
}

export async function executeManagedSessionSync(input: {
  supabase: SupabaseLike;
  account: PlatformAccount;
  householdTimeZone: string;
  jobId: string;
}) {
  try {
    if (isManagedSessionExpired(input.account)) {
      const refreshed = await tryAutoLoginRefresh(input.supabase, input.account);
      if (!refreshed) {
        throw getManagedSessionExpiredError(input.account.platform);
      }
    }

    const connectorResult =
      input.account.platform === "ixl"
        ? await runIxlManagedSessionSync({
            account: input.account as any,
          })
        : await runKhanManagedSessionSync({
            account: input.account as any,
          });

    if (!connectorResult.events[0]) {
      await completePlatformSyncJob({
        supabase: input.supabase as any,
        jobId: input.jobId,
        platformAccountId: input.account.id,
        rawSummary: {
          ingestStatus: "no_events",
          fetchSummary: connectorResult.summary,
        },
      });

      return {
        status: "completed" as const,
        ingestStatus: "no_events" as const,
        learningEventId: null,
        learningEventIds: [],
        localDateKey: null,
        homeworkResults: [],
        reviewStatus: null,
        importedEventCount: 0,
        fetchSummary: connectorResult.summary,
      };
    }

    const importedResults = [];

    for (const normalizedEvent of connectorResult.events) {
      importedResults.push(
        await importNormalizedEvent({
          supabase: input.supabase,
          account: input.account,
          householdTimeZone: input.householdTimeZone,
          normalizedEvent,
        })
      );
    }

    const homeworkResults = importedResults.flatMap(
      (result) => result.homeworkResults
    );
    const learningEventIds = importedResults
      .map((result) => result.learningEventId)
      .filter((learningEventId): learningEventId is string => !!learningEventId);
    const localDateKey =
      importedResults.find((result) => result.localDateKey)?.localDateKey ?? null;
    const reviewStatus =
      importedResults.find((result) => result.reviewStatus)?.reviewStatus ?? null;
    const ingestStatus = importedResults.every(
      (result) => result.ingestStatus === "duplicate"
    )
      ? "duplicate"
      : "inserted";

    await completePlatformSyncJob({
      supabase: input.supabase as any,
      jobId: input.jobId,
      platformAccountId: input.account.id,
      rawSummary: {
        ingestStatus,
        localDateKey,
        autoCheckinCount: homeworkResults.length,
        importedEventCount: importedResults.length,
        fetchSummary: connectorResult.summary,
      },
    });

    return {
      status: "completed" as const,
      ingestStatus,
      learningEventId: learningEventIds[0] ?? null,
      learningEventIds,
      localDateKey,
      homeworkResults,
      reviewStatus,
      importedEventCount: importedResults.length,
      fetchSummary: connectorResult.summary,
    };
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : "Managed session sync failed";

    if (
      error instanceof IxlManagedSessionError ||
      error instanceof KhanManagedSessionError
    ) {
      await markPlatformAccountAttentionRequired({
        supabase: input.supabase as any,
        jobId: input.jobId,
        platformAccountId: input.account.id,
        errorSummary,
      });

      return {
        status: "attention_required" as const,
        error: errorSummary,
      };
    }

    const retryCount = 1;
    const nextRetryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await markPlatformSyncJobFailed({
      supabase: input.supabase as any,
      jobId: input.jobId,
      platformAccountId: input.account.id,
      errorSummary,
      retryCount,
      nextRetryAt,
    });

    return {
      status: "failed" as const,
      error: errorSummary,
      retryCount,
      nextRetryAt,
    };
  }
}
