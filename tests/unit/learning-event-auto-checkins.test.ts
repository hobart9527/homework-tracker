import { describe, expect, it, vi } from "vitest";
import { syncLearningEventAutoCheckins } from "@/lib/learning-event-auto-checkins";

describe("syncLearningEventAutoCheckins", () => {
  it("ingests a learning event and auto-completes only the matched candidate homework", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-1",
            child_id: "child-1",
            local_date_key: "2026-04-20",
          },
          error: null,
        }),
      })),
    }));
    const checkInInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "check-1",
            homework_id: "hw-1",
          },
          error: null,
        }),
      })),
    }));
    const matchInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "match-1",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1",
        subject: "math",
        durationMinutes: 25,
        score: 0.92,
        completionState: "completed",
        sourceRef: "ixl-a1-2026-04-20",
        rawPayload: { skill: "A.1" },
      },
      candidateHomeworks: [
        {
          id: "hw-1",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
        {
          id: "hw-2",
          child_id: "child-1",
          type_name: "阅读",
          point_value: 3,
          estimated_minutes: 40,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
      ],
      existingCheckInsByHomeworkId: {},
    });

    expect(learningEventInsertMock).toHaveBeenCalledTimes(1);
    expect(checkInInsertMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ingestStatus: "inserted",
      learningEventId: "event-1",
      homeworkResults: [
        {
          homeworkId: "hw-1",
          decision: "auto_completed",
          createdCheckInId: "check-1",
        },
      ],
    });
  });

  it("skips auto-checkins when the imported event is a duplicate", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              "duplicate key value violates unique constraint learning_events_account_source_key",
          },
        }),
      })),
    }));
    const checkInInsertMock = vi.fn();

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        return {
          insert: checkInInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1",
        subject: "math",
        durationMinutes: 25,
        score: 0.92,
        completionState: "completed",
        sourceRef: "ixl-a1-2026-04-20",
        rawPayload: { skill: "A.1" },
      },
      candidateHomeworks: [
        {
          id: "hw-1",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
      ],
      existingCheckInsByHomeworkId: {},
    });

    expect(checkInInsertMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ingestStatus: "duplicate",
      learningEventId: null,
      localDateKey: "2026-04-20",
      homeworkResults: [],
      reviewStatus: null,
    });
  });

  it("creates an unmatched review when there are no candidate homeworks for the synced event", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-2",
            child_id: "child-1",
            local_date_key: "2026-04-20",
          },
          error: null,
        }),
      })),
    }));
    const reviewInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "review-1",
            learning_event_id: "event-2",
            review_status: "unmatched",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        return {
          insert: reviewInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1",
        subject: "math",
        durationMinutes: 25,
        score: 0.92,
        completionState: "completed",
        sourceRef: "ixl-a1-2026-04-20",
        rawPayload: { skill: "A.1" },
      },
      candidateHomeworks: [],
      existingCheckInsByHomeworkId: {},
    });

    expect(reviewInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_event_id: "event-2",
        review_status: "unmatched",
        review_reason: "no_candidate_homeworks",
      })
    );
    expect(result).toMatchObject({
      ingestStatus: "inserted",
      learningEventId: "event-2",
      homeworkResults: [],
      reviewStatus: "unmatched",
    });
  });

  it("creates an unmatched review when same-day candidates exist but none satisfy the matching threshold", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-3",
            child_id: "child-1",
            local_date_key: "2026-04-20",
          },
          error: null,
        }),
      })),
    }));
    const reviewInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "review-2",
            learning_event_id: "event-3",
            review_status: "unmatched",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        if (table === "check_ins") {
          return {
            insert: vi.fn(),
          };
        }

        return {
          insert: reviewInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1",
        subject: "math",
        durationMinutes: 10,
        score: 0.92,
        completionState: "completed",
        sourceRef: "ixl-a1-2026-04-20",
        rawPayload: { skill: "A.1" },
      },
      candidateHomeworks: [
        {
          id: "hw-1",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
      ],
      existingCheckInsByHomeworkId: {},
    });

    expect(reviewInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_event_id: "event-3",
        review_status: "unmatched",
        review_reason: "no_matching_homework",
      })
    );
    expect(result).toMatchObject({
      ingestStatus: "inserted",
      learningEventId: "event-3",
      homeworkResults: [],
      reviewStatus: "unmatched",
    });
  });

  it("uses completion-state matching when the homework has no duration requirement", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-4",
            child_id: "child-1",
            local_date_key: "2026-04-20",
          },
          error: null,
        }),
      })),
    }));
    const checkInInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "check-2",
            homework_id: "hw-3",
          },
          error: null,
        }),
      })),
    }));
    const matchInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "match-3",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "khan-academy",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "lesson_completed",
        title: "Fractions basics",
        subject: "math",
        durationMinutes: 0,
        score: 0.92,
        completionState: "practiced",
        sourceRef: "lesson-4",
        rawPayload: { lessonId: "lesson-4" },
      },
      candidateHomeworks: [
        {
          id: "hw-3",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: null,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
      ],
      existingCheckInsByHomeworkId: {},
    });

    expect(matchInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework_id: "hw-3",
        learning_event_id: "event-4",
        match_rule: "completion_state",
        match_result: "auto_completed",
      })
    );
    expect(result).toMatchObject({
      ingestStatus: "inserted",
      learningEventId: "event-4",
      homeworkResults: [
        {
          homeworkId: "hw-3",
          decision: "auto_completed",
          createdCheckInId: "check-2",
        },
      ],
      reviewStatus: null,
    });
  });

  it("filters out same-day homework whose type does not match the platform event subject", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-5",
            child_id: "child-1",
            local_date_key: "2026-04-20",
          },
          error: null,
        }),
      })),
    }));
    const checkInInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "check-3",
            homework_id: "hw-math",
          },
          error: null,
        }),
      })),
    }));
    const matchInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "match-4",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1 Add within 10",
        subject: "math",
        durationMinutes: 25,
        score: 0.92,
        completionState: "completed",
        sourceRef: "ixl-a1-2026-04-20",
        rawPayload: { skill: "A.1" },
      },
      candidateHomeworks: [
        {
          id: "hw-read",
          child_id: "child-1",
          type_name: "阅读",
          point_value: 4,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
        {
          id: "hw-math",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
      ],
      existingCheckInsByHomeworkId: {},
    });

    expect(checkInInsertMock).toHaveBeenCalledTimes(1);
    expect(matchInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework_id: "hw-math",
        learning_event_id: "event-5",
      })
    );
    expect(result).toMatchObject({
      homeworkResults: [
        {
          homeworkId: "hw-math",
          decision: "auto_completed",
          createdCheckInId: "check-3",
        },
      ],
    });
  });

  it("prefers explicit platform-task bindings over broad type matches", async () => {
    const learningEventInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-6",
            child_id: "child-1",
            local_date_key: "2026-04-20",
          },
          error: null,
        }),
      })),
    }));
    const checkInInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "check-4",
            homework_id: "hw-bound",
          },
          error: null,
        }),
      })),
    }));
    const matchInsertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "match-5",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "learning_events") {
          return {
            insert: learningEventInsertMock,
          };
        }

        if (table === "check_ins") {
          return {
            insert: checkInInsertMock,
          };
        }

        return {
          insert: matchInsertMock,
        };
      }),
    };

    const result = await syncLearningEventAutoCheckins({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T10:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1 Add within 10",
        subject: "math",
        durationMinutes: 25,
        score: 0.92,
        completionState: "completed",
        sourceRef: "session-123",
        rawPayload: { skill: "A.1" },
      },
      candidateHomeworks: [
        {
          id: "hw-unbound",
          child_id: "child-1",
          type_name: "数学",
          point_value: 4,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: null,
          platform_binding_source_ref: null,
        },
        {
          id: "hw-bound",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: "ixl",
          platform_binding_source_ref: "session-123",
        },
        {
          id: "hw-other-binding",
          child_id: "child-1",
          type_name: "数学",
          point_value: 5,
          estimated_minutes: 20,
          required_checkpoint_type: null,
          platform_binding_platform: "ixl",
          platform_binding_source_ref: "session-999",
        },
      ],
      existingCheckInsByHomeworkId: {},
    });

    expect(matchInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        homework_id: "hw-bound",
        learning_event_id: "event-6",
        match_rule: "direct_platform_task_binding",
      })
    );
    expect(result).toMatchObject({
      homeworkResults: expect.arrayContaining([
        expect.objectContaining({
          homeworkId: "hw-bound",
          decision: "auto_completed",
          createdCheckInId: "check-4",
        }),
      ]),
    });
  });
});
