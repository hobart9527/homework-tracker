import { normalizeKhanLearningEvent } from "@/lib/platform-adapters/khan-academy";
import {
  fetchKhanManagedSessionActivities,
  KhanManagedSessionError,
  type KhanManagedSessionPayload,
} from "@/lib/platform-adapters/khan-fetch";

type KhanPlatformAccount = {
  id: string;
  platform: string;
  managed_session_payload?: KhanManagedSessionPayload | null;
};

export async function runKhanManagedSessionSync(input: {
  account: KhanPlatformAccount;
  fetchImpl?: typeof fetch;
}) {
  if (!input.account.managed_session_payload) {
    throw new KhanManagedSessionError("Managed Khan session is missing");
  }

  const activities = await fetchKhanManagedSessionActivities({
    managedSessionPayload: input.account.managed_session_payload,
    fetchImpl: input.fetchImpl,
  });

  return {
    summary: {
      fetchedCount: activities.length,
    },
    events: activities.map((activity) =>
      normalizeKhanLearningEvent({
        occurredAt: activity.occurredAt,
        lessonId: activity.lessonId,
        lessonTitle: activity.lessonTitle,
        courseName: activity.courseName,
        masteryLevel: activity.masteryLevel,
        progressPercent: activity.progressPercent,
        durationSeconds: activity.durationSeconds,
      })
    ),
  };
}
