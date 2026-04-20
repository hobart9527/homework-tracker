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
});
