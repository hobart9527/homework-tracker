import { describe, expect, it } from "vitest";
import { normalizeKhanLearningEvent } from "@/lib/platform-adapters/khan-academy";

describe("normalizeKhanLearningEvent", () => {
  it("maps a Khan lesson payload into the shared learning event shape", () => {
    expect(
      normalizeKhanLearningEvent({
        occurredAt: "2026-04-20T11:00:00.000Z",
        lessonId: "lesson-123",
        lessonTitle: "Fractions basics",
        courseName: "Math 3",
        masteryLevel: "practiced",
        progressPercent: 88,
        durationSeconds: 1800,
      })
    ).toEqual({
      occurredAt: "2026-04-20T11:00:00.000Z",
      eventType: "lesson_completed",
      title: "Khan Academy Fractions basics",
      subject: "Math 3",
      durationMinutes: 30,
      score: 0.88,
      completionState: "practiced",
      sourceRef: "lesson-123",
      rawPayload: {
        lessonId: "lesson-123",
        lessonTitle: "Fractions basics",
        courseName: "Math 3",
        masteryLevel: "practiced",
        progressPercent: 88,
        durationSeconds: 1800,
      },
    });
  });

  it("falls back to a deterministic source ref when lesson id is absent", () => {
    const normalized = normalizeKhanLearningEvent({
      occurredAt: "2026-04-20T11:00:00.000Z",
      lessonTitle: "Reading comprehension",
      progressPercent: 100,
    });

    expect(normalized.sourceRef).toBe(
      "khan:Reading comprehension:2026-04-20T11:00:00.000Z"
    );
    expect(normalized.score).toBe(1);
    expect(normalized.durationMinutes).toBeNull();
  });
});
