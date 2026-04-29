import { describe, expect, it } from "vitest";
import { normalizeIxlLearningEvent } from "@/lib/platform-adapters/ixl";

describe("normalizeIxlLearningEvent", () => {
  it("maps an IXL skill practice payload into the shared learning event shape", () => {
    expect(
      normalizeIxlLearningEvent({
        occurredAt: "2026-04-20T10:00:00.000Z",
        skillId: "A.1",
        skillName: "Add within 10",
        subject: "math",
        scorePercent: 92,
        durationSeconds: 1500,
        sessionId: "session-123",
      })
    ).toEqual({
      occurredAt: "2026-04-20T10:00:00.000Z",
      eventType: "skill_practice",
      title: "Add within 10",
      subject: "math",
      durationMinutes: 25,
      score: 0.92,
      completionState: "completed",
      sourceRef: "session-123",
      rawPayload: {
        skillId: "A.1",
        skillName: "Add within 10",
        subject: "math",
        scorePercent: 92,
        durationSeconds: 1500,
        sessionId: "session-123",
        mergeKey: "ixl:math:A.1:2026-04-20",
      },
    });
  });

  it("falls back to a deterministic source ref when the session id is absent", () => {
    const normalized = normalizeIxlLearningEvent({
      occurredAt: "2026-04-20T10:00:00.000Z",
      skillId: "B.2",
      skillName: "Subtract within 20",
      durationSeconds: 600,
    });

    expect(normalized.sourceRef).toBe("ixl:unknown:B.2:2026-04-20");
    expect(normalized.durationMinutes).toBe(10);
    expect(normalized.score).toBeNull();
  });
});
