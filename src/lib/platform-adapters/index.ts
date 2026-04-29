import { normalizeIxlLearningEvent } from "@/lib/platform-adapters/ixl";
import { normalizeKhanLearningEvent } from "@/lib/platform-adapters/khan-academy";
export { runEpicManagedSessionSync } from "@/lib/platform-adapters/epic-connector";
export { runIxlManagedSessionSync } from "@/lib/platform-adapters/ixl-connector";
export { runKhanManagedSessionSync } from "@/lib/platform-adapters/khan-connector";
export { runRazKidsManagedSessionSync } from "@/lib/platform-adapters/raz-kids-connector";

type NormalizedLearningEvent = {
  occurredAt: string;
  eventType: string;
  title: string;
  subject: string | null;
  durationMinutes: number | null;
  score: number | null;
  completionState: string | null;
  sourceRef: string;
  rawPayload: Record<string, unknown>;
};

type SupportedPlatform = "ixl" | "khan-academy";

export function normalizePlatformLearningEvent(input: {
  platform: string;
  rawEvent: Record<string, unknown> | null | undefined;
}): NormalizedLearningEvent | null {
  if (!input.rawEvent) {
    return null;
  }

  if (input.platform === "ixl") {
    return normalizeIxlLearningEvent({
      occurredAt: String(input.rawEvent.occurredAt),
      skillId: String(input.rawEvent.skillId),
      skillName: String(input.rawEvent.skillName),
      subject:
        typeof input.rawEvent.subject === "string"
          ? input.rawEvent.subject
          : null,
      scorePercent:
        typeof input.rawEvent.scorePercent === "number"
          ? input.rawEvent.scorePercent
          : null,
      durationSeconds:
        typeof input.rawEvent.durationSeconds === "number"
          ? input.rawEvent.durationSeconds
          : null,
      sessionId:
        typeof input.rawEvent.sessionId === "string"
          ? input.rawEvent.sessionId
          : null,
    });
  }

  if (input.platform === "khan-academy") {
    return normalizeKhanLearningEvent({
      occurredAt: String(input.rawEvent.occurredAt),
      lessonId:
        typeof input.rawEvent.lessonId === "string"
          ? input.rawEvent.lessonId
          : null,
      lessonTitle: String(input.rawEvent.lessonTitle),
      courseName:
        typeof input.rawEvent.courseName === "string"
          ? input.rawEvent.courseName
          : null,
      masteryLevel:
        typeof input.rawEvent.masteryLevel === "string"
          ? input.rawEvent.masteryLevel
          : null,
      progressPercent:
        typeof input.rawEvent.progressPercent === "number"
          ? input.rawEvent.progressPercent
          : null,
      durationSeconds:
        typeof input.rawEvent.durationSeconds === "number"
          ? input.rawEvent.durationSeconds
          : null,
    });
  }

  return null;
}

export function supportsRawPlatformImport(platform: string): platform is SupportedPlatform {
  return platform === "ixl" || platform === "khan-academy";
}
