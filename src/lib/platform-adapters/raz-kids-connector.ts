import { normalizeRazKidsLearningEvent } from "@/lib/platform-adapters/raz-kids";
import {
  fetchRazKidsManagedSessionActivities,
  RazKidsManagedSessionError,
  type RazKidsManagedSessionPayload,
} from "@/lib/platform-adapters/raz-kids-fetch";

type RazKidsPlatformAccount = {
  id: string;
  platform: string;
  managed_session_payload?: RazKidsManagedSessionPayload | null;
};

export async function runRazKidsManagedSessionSync(input: {
  account: RazKidsPlatformAccount;
  fetchImpl?: typeof fetch;
}) {
  if (!input.account.managed_session_payload) {
    throw new RazKidsManagedSessionError("Managed Raz-Kids session is missing");
  }

  const activities = await fetchRazKidsManagedSessionActivities({
    managedSessionPayload: input.account.managed_session_payload,
    fetchImpl: input.fetchImpl,
  });

  return {
    summary: {
      fetchedCount: activities.length,
    },
    events: activities.map((activity) =>
      normalizeRazKidsLearningEvent({
        occurredAt: activity.occurredAt,
        activityId: activity.activityId,
        title: activity.title,
        level: activity.level,
        activityType: activity.activityType,
        quizScorePercent: activity.quizScorePercent,
        durationSeconds: activity.durationSeconds,
      })
    ),
  };
}
