import { describe, expect, it, vi } from "vitest";
import { ingestLearningEvent } from "@/lib/learning-events";

describe("ingestLearningEvent", () => {
  it("persists child ownership, account identity, raw payload, and the household-local date key", async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "event-1",
            child_id: "child-1",
            platform_account_id: "acct-1",
            source_ref: "lesson-123",
            local_date_key: "2026-04-21",
          },
          error: null,
        }),
      })),
    }));

    const supabase = {
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    };

    const result = await ingestLearningEvent({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "khan-academy",
        platformAccountId: "acct-1",
        occurredAt: "2026-04-20T16:30:00.000Z",
        eventType: "lesson_completed",
        title: "Fractions basics",
        subject: "math",
        durationMinutes: 25,
        score: 0.96,
        completionState: "completed",
        sourceRef: "lesson-123",
        rawPayload: {
          lessonId: "lesson-123",
          mastery: "proficient",
        },
      },
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        child_id: "child-1",
        platform: "khan-academy",
        platform_account_id: "acct-1",
        source_ref: "lesson-123",
        raw_payload: {
          lessonId: "lesson-123",
          mastery: "proficient",
        },
        local_date_key: "2026-04-21",
      })
    );
    expect(result).toMatchObject({
      status: "inserted",
      localDateKey: "2026-04-21",
      event: {
        id: "event-1",
      },
    });
  });

  it("treats duplicate source refs for the same platform account as duplicate ingestion", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                message: "duplicate key value violates unique constraint learning_events_account_source_key",
              },
            }),
          })),
        })),
      })),
    };

    const result = await ingestLearningEvent({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-family",
        occurredAt: "2026-04-20T08:00:00.000Z",
        eventType: "skill_practice",
        title: "IXL A.1",
        subject: "math",
        durationMinutes: 20,
        score: 0.9,
        completionState: "completed",
        sourceRef: "practice-456",
        rawPayload: {
          skill: "A.1",
        },
      },
    });

    expect(result).toMatchObject({
      status: "duplicate",
      event: null,
      localDateKey: "2026-04-20",
    });
  });

  it("merges IXL duration for the same day, subject, and learning content", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "event-ixl-1",
        duration_minutes: 12,
        raw_payload: {
          sessionIds: ["session-123"],
        },
      },
      error: null,
    });
    const updateSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "event-ixl-1",
        duration_minutes: 20,
      },
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "learning_events") {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: maybeSingleMock,
                    })),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: updateSingleMock,
              })),
            })),
          })),
          insert: vi.fn(),
        };
      }),
    };

    const result = await ingestLearningEvent({
      supabase: supabase as any,
      householdTimeZone: "Asia/Shanghai",
      event: {
        childId: "child-1",
        platform: "ixl",
        platformAccountId: "acct-family",
        occurredAt: "2026-04-20T08:00:00.000Z",
        eventType: "skill_practice",
        title: "Add within 10",
        subject: "math",
        durationMinutes: 8,
        score: 0.9,
        completionState: "completed",
        sourceRef: "session-456",
        rawPayload: {
          skillId: "A.1",
          sessionId: "session-456",
        },
      },
    });

    expect(updateSingleMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "merged",
      localDateKey: "2026-04-20",
      event: {
        id: "event-ixl-1",
      },
    });
  });
});
