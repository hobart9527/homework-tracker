import { normalizeEpicLearningEvent } from "@/lib/platform-adapters/epic";
import {
  EpicManagedSessionError,
  fetchEpicManagedSessionActivities,
  type EpicManagedSessionPayload,
} from "@/lib/platform-adapters/epic-fetch";

type EpicPlatformAccount = {
  id: string;
  platform: string;
  managed_session_payload?: EpicManagedSessionPayload | null;
};

export async function runEpicManagedSessionSync(input: {
  account: EpicPlatformAccount;
  fetchImpl?: typeof fetch;
}) {
  if (!input.account.managed_session_payload) {
    throw new EpicManagedSessionError("Managed Epic session is missing");
  }

  const activities = await fetchEpicManagedSessionActivities({
    managedSessionPayload: input.account.managed_session_payload,
    fetchImpl: input.fetchImpl,
  });

  return {
    summary: {
      fetchedCount: activities.length,
    },
    events: activities.map((activity) =>
      normalizeEpicLearningEvent({
        occurredAt: activity.occurredAt,
        activityId: activity.activityId,
        title: activity.title,
        category: activity.category,
        status: activity.status,
        progressPercent: activity.progressPercent,
        durationSeconds: activity.durationSeconds,
      })
    ),
  };
}
