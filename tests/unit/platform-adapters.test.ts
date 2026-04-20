import { describe, expect, it } from "vitest";
import {
  normalizePlatformLearningEvent,
  supportsRawPlatformImport,
} from "@/lib/platform-adapters";

describe("supportsRawPlatformImport", () => {
  it("returns true for currently supported raw-import platforms", () => {
    expect(supportsRawPlatformImport("ixl")).toBe(true);
    expect(supportsRawPlatformImport("khan-academy")).toBe(true);
  });

  it("returns false for platforms that do not yet have raw payload adapters", () => {
    expect(supportsRawPlatformImport("raz-kids")).toBe(false);
    expect(supportsRawPlatformImport("epic")).toBe(false);
  });
});

describe("normalizePlatformLearningEvent", () => {
  it("dispatches IXL raw payloads to the IXL normalizer", () => {
    expect(
      normalizePlatformLearningEvent({
        platform: "ixl",
        rawEvent: {
          occurredAt: "2026-04-20T10:00:00.000Z",
          skillId: "A.1",
          skillName: "Add within 10",
          subject: "math",
          scorePercent: 92,
          durationSeconds: 1500,
          sessionId: "session-123",
        },
      })
    ).toMatchObject({
      eventType: "skill_practice",
      title: "IXL A.1 Add within 10",
      sourceRef: "session-123",
      score: 0.92,
      durationMinutes: 25,
    });
  });

  it("dispatches Khan Academy raw payloads to the Khan normalizer", () => {
    expect(
      normalizePlatformLearningEvent({
        platform: "khan-academy",
        rawEvent: {
          occurredAt: "2026-04-20T11:00:00.000Z",
          lessonId: "lesson-123",
          lessonTitle: "Fractions basics",
          courseName: "Math 3",
          masteryLevel: "practiced",
          progressPercent: 88,
          durationSeconds: 1800,
        },
      })
    ).toMatchObject({
      eventType: "lesson_completed",
      title: "Khan Academy Fractions basics",
      sourceRef: "lesson-123",
      score: 0.88,
      durationMinutes: 30,
      completionState: "practiced",
    });
  });

  it("returns null when the platform has no raw adapter yet", () => {
    expect(
      normalizePlatformLearningEvent({
        platform: "raz-kids",
        rawEvent: {
          occurredAt: "2026-04-20T12:00:00.000Z",
        },
      })
    ).toBeNull();
  });
});
