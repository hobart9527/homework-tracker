import { normalizeIxlLearningEvent } from "@/lib/platform-adapters/ixl";
import {
  fetchIxlManagedSessionActivities,
  IxlManagedSessionError,
  type IxlManagedSessionPayload,
} from "@/lib/platform-adapters/ixl-fetch";

type IxlPlatformAccount = {
  id: string;
  platform: string;
  managed_session_payload?: IxlManagedSessionPayload | null;
};

export async function runIxlManagedSessionSync(input: {
  account: IxlPlatformAccount;
  fetchImpl?: typeof fetch;
}) {
  if (!input.account.managed_session_payload) {
    throw new IxlManagedSessionError("Managed IXL session is missing");
  }

  const activities = await fetchIxlManagedSessionActivities({
    managedSessionPayload: input.account.managed_session_payload,
    fetchImpl: input.fetchImpl,
  });

  return {
    summary: {
      fetchedCount: activities.length,
    },
    events: activities.map((activity) =>
      normalizeIxlLearningEvent({
        occurredAt: activity.occurredAt,
        skillId: activity.skillId,
        skillName: activity.skillName,
        subject: activity.subject,
        scorePercent: activity.scorePercent,
        durationSeconds: activity.durationSeconds,
        sessionId: activity.sessionId,
      })
    ),
  };
}
