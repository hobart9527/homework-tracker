import { runEpicManagedSessionSync } from "@/lib/platform-adapters/epic-connector";
import { EpicManagedSessionError } from "@/lib/platform-adapters/epic-fetch";
import {
  loadAutoCheckinContext,
  syncLearningEventAutoCheckins,
} from "@/lib/learning-event-auto-checkins";
import { runIxlManagedSessionSync } from "@/lib/platform-adapters/ixl-connector";
import { IxlManagedSessionError } from "@/lib/platform-adapters/ixl-fetch";
import { runKhanManagedSessionSync } from "@/lib/platform-adapters/khan-connector";
import { KhanManagedSessionError } from "@/lib/platform-adapters/khan-fetch";
import { runRazKidsManagedSessionSync } from "@/lib/platform-adapters/raz-kids-connector";
import { RazKidsManagedSessionError } from "@/lib/platform-adapters/raz-kids-fetch";
import {
  completePlatformSyncJob,
  markPlatformSyncJobFailed,
  markPlatformAccountAttentionRequired,
} from "@/lib/platform-sync";
import { decryptCredential } from "@/lib/crypto";
import { simulateIxlLogin } from "@/lib/platform-adapters/ixl-auth";
import { simulateKhanLogin } from "@/lib/platform-adapters/khan-auth";
import { sendTelegramTextMessage } from "@/lib/telegram";
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
  external_account_ref?: string | null;
  managed_session_payload?: Record<string, unknown> | null;
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

function isSessionExpiredError(error: unknown): boolean {
  return (
    error instanceof IxlManagedSessionError ||
    error instanceof KhanManagedSessionError ||
    error instanceof EpicManagedSessionError ||
    error instanceof RazKidsManagedSessionError
  );
}

function hasManagedSessionActivityUrl(
  payload: PlatformAccount["managed_session_payload"]
) {
  return (
    !!payload &&
    typeof payload.activityUrl === "string" &&
    payload.activityUrl.trim().length > 0
  );
}

export function supportsManagedSessionSync(account: PlatformAccount) {
  if (!account.managed_session_payload) {
    return false;
  }

  if (account.platform === "ixl" || account.platform === "khan-academy") {
    return true;
  }

  if (account.platform === "epic" || account.platform === "raz-kids") {
    return hasManagedSessionActivityUrl(account.managed_session_payload);
  }

  return false;
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

  return true;
}

async function notifyParentSessionExpired(
  supabase: SupabaseLike,
  account: PlatformAccount
): Promise<void> {
  try {
    // Fetch child and parent info
    const { data: child } = await (supabase as any)
      .from("children")
      .select("name, parent_id")
      .eq("id", account.child_id)
      .single();

    if (!child) return;

    const { data: parent } = await (supabase as any)
      .from("parents")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("id", child.parent_id)
      .single();

    if (!parent?.telegram_bot_token || !parent?.telegram_chat_id) {
      return;
    }

    const platformNames: Record<string, string> = {
      ixl: "IXL",
      "khan-academy": "Khan Academy",
      epic: "Epic",
      "raz-kids": "Raz-Kids",
    };

    const text =
      `⚠️ <b>Session 过期提醒</b>\n\n` +
      `孩子：<b>${child.name}</b>\n` +
      `平台：<b>${platformNames[account.platform] ?? account.platform}</b>\n` +
      `账号：${account.external_account_ref ?? "未知"}\n\n` +
      `自动登录刷新失败，Session 已过期。\n` +
      `请打开应用「设置 → 孩子集成」，点击「刷新登录」或「手动补录」更新 Session。`;

    await sendTelegramTextMessage({
      botToken: parent.telegram_bot_token,
      chatId: parent.telegram_chat_id,
      text,
    });
  } catch {
    // Silently fail notification — don't block the sync flow
  }
}

async function runConnectorSync(account: PlatformAccount) {
  if (account.platform === "ixl") {
    return await runIxlManagedSessionSync({ account: account as any });
  }
  if (account.platform === "khan-academy") {
    return await runKhanManagedSessionSync({ account: account as any });
  }
  if (account.platform === "epic") {
    return await runEpicManagedSessionSync({ account: account as any });
  }
  return await runRazKidsManagedSessionSync({ account: account as any });
}

export async function executeManagedSessionSync(input: {
  supabase: SupabaseLike;
  account: PlatformAccount;
  householdTimeZone: string;
  jobId: string;
}) {
  async function handleSuccess(connectorResult: {
    summary: { fetchedCount: number };
    events: ReturnType<typeof importNormalizedEvent> extends Promise<infer T> ? T[] : never;
  }) {
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
          normalizedEvent: normalizedEvent as any,
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
  }

  async function handleSessionExpired(error: Error) {
    // Try to refresh session automatically
    const refreshed = await tryAutoLoginRefresh(input.supabase, input.account);
    if (!refreshed) {
      // Notify parent via Telegram
      await notifyParentSessionExpired(input.supabase, input.account);

      await markPlatformAccountAttentionRequired({
        supabase: input.supabase as any,
        jobId: input.jobId,
        platformAccountId: input.account.id,
        errorSummary: error.message,
      });

      return {
        status: "attention_required" as const,
        error: error.message,
      };
    }

    // Refresh succeeded — retry sync
    try {
      const connectorResult = await runConnectorSync(input.account);
      return await handleSuccess(connectorResult as any);
    } catch (retryError) {
      const retrySummary =
        retryError instanceof Error ? retryError.message : "Retry sync failed";

      await notifyParentSessionExpired(input.supabase, input.account);
      await markPlatformAccountAttentionRequired({
        supabase: input.supabase as any,
        jobId: input.jobId,
        platformAccountId: input.account.id,
        errorSummary: retrySummary,
      });

      return {
        status: "attention_required" as const,
        error: retrySummary,
      };
    }
  }

  try {
    const connectorResult = await runConnectorSync(input.account);
    return await handleSuccess(connectorResult as any);
  } catch (error) {
    const errorSummary =
      error instanceof Error ? error.message : "Managed session sync failed";

    if (isSessionExpiredError(error)) {
      return await handleSessionExpired(error as Error);
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
