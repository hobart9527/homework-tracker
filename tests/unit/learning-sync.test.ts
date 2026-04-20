import { describe, expect, it } from "vitest";
import {
  buildLearningEventDedupKey,
  getDateKeyInTimeZone,
  matchesDirectPlatformBinding,
  matchesPlatformHomeworkType,
  resolveAutoCheckinDecision,
  selectPrimaryHomeworkMatch,
} from "@/lib/learning-sync";

describe("buildLearningEventDedupKey", () => {
  it("uses platform account identity so family and school accounts do not collide", () => {
    const familyKey = buildLearningEventDedupKey({
      childId: "child-1",
      platform: "khan",
      platformAccountId: "acct-family",
      sourceRef: "lesson-123",
    });

    const schoolKey = buildLearningEventDedupKey({
      childId: "child-1",
      platform: "khan",
      platformAccountId: "acct-school",
      sourceRef: "lesson-123",
    });

    expect(familyKey).not.toBe(schoolKey);
  });
});

describe("getDateKeyInTimeZone", () => {
  it("normalizes late-night events into the household time zone", () => {
    expect(
      getDateKeyInTimeZone("2026-04-20T16:30:00.000Z", "Asia/Shanghai")
    ).toBe("2026-04-21");
  });
});

describe("selectPrimaryHomeworkMatch", () => {
  it("uses earliest-match-wins as the primary evidence rule", () => {
    const primary = selectPrimaryHomeworkMatch([
      {
        learningEventId: "event-2",
        matchedAt: "2026-04-20T16:10:00.000Z",
      },
      {
        learningEventId: "event-1",
        matchedAt: "2026-04-20T15:50:00.000Z",
      },
    ]);

    expect(primary?.learningEventId).toBe("event-1");
  });
});

describe("resolveAutoCheckinDecision", () => {
  it("auto completes when duration meets the requirement and no extra proof is required", () => {
    expect(
      resolveAutoCheckinDecision({
        requiredMinutes: 20,
        requiredCheckpointType: null,
        durationMinutes: 20,
      })
    ).toBe("auto_completed");
  });

  it("returns partially completed when duration is enough but the homework also requires an attachment", () => {
    expect(
      resolveAutoCheckinDecision({
        requiredMinutes: 20,
        requiredCheckpointType: "audio",
        durationMinutes: 20,
      })
    ).toBe("partially_completed");
  });

  it("returns unmatched for invalid duration values", () => {
    expect(
      resolveAutoCheckinDecision({
        requiredMinutes: 20,
        requiredCheckpointType: null,
        durationMinutes: 0,
      })
    ).toBe("unmatched");
  });

  it("auto completes from completion state when the homework has no duration threshold", () => {
    expect(
      resolveAutoCheckinDecision({
        requiredMinutes: null,
        requiredCheckpointType: null,
        durationMinutes: 0,
        completionState: "completed",
      })
    ).toBe("auto_completed");
  });

  it("does not auto complete from completion state alone when the homework still requires minutes", () => {
    expect(
      resolveAutoCheckinDecision({
        requiredMinutes: 20,
        requiredCheckpointType: null,
        durationMinutes: 0,
        completionState: "completed",
      })
    ).toBe("unmatched");
  });
});

describe("matchesPlatformHomeworkType", () => {
  it("matches known homework type aliases against the platform subject", () => {
    expect(
      matchesPlatformHomeworkType({
        platform: "khan-academy",
        subject: "Math 3",
        title: "Fractions basics",
        homeworkTypeName: "数学",
      })
    ).toBe(true);
  });

  it("prevents mismatched homework types from auto-matching the wrong platform event", () => {
    expect(
      matchesPlatformHomeworkType({
        platform: "ixl",
        subject: "math",
        title: "IXL A.1 Add within 10",
        homeworkTypeName: "阅读",
      })
    ).toBe(false);
  });

  it("falls back to permissive matching when the homework has no type label", () => {
    expect(
      matchesPlatformHomeworkType({
        platform: "ixl",
        subject: "math",
        title: "IXL A.1 Add within 10",
        homeworkTypeName: null,
      })
    ).toBe(true);
  });
});

describe("matchesDirectPlatformBinding", () => {
  it("matches when both platform and source ref are an exact fit", () => {
    expect(
      matchesDirectPlatformBinding({
        eventPlatform: "ixl",
        eventSourceRef: "session-123",
        homeworkBindingPlatform: "ixl",
        homeworkBindingSourceRef: "session-123",
      })
    ).toBe(true);
  });

  it("does not match when the source ref differs", () => {
    expect(
      matchesDirectPlatformBinding({
        eventPlatform: "ixl",
        eventSourceRef: "session-456",
        homeworkBindingPlatform: "ixl",
        homeworkBindingSourceRef: "session-123",
      })
    ).toBe(false);
  });
});
