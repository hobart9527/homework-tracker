import { describe, expect, it, vi } from "vitest";
import { createLearningEventReview } from "@/lib/learning-event-reviews";

describe("createLearningEventReview", () => {
  it("creates an unmatched review record for later operator inspection", async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "review-1",
            learning_event_id: "event-1",
            review_status: "unmatched",
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

    const result = await createLearningEventReview({
      supabase: supabase as any,
      learningEventId: "event-1",
      reviewStatus: "unmatched",
      reviewReason: "no_candidate_homeworks",
      reviewSummary: {
        platform: "ixl",
        localDateKey: "2026-04-20",
      },
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_event_id: "event-1",
        review_status: "unmatched",
        review_reason: "no_candidate_homeworks",
        review_summary: {
          platform: "ixl",
          localDateKey: "2026-04-20",
        },
      })
    );
    expect(result).toMatchObject({
      status: "created",
      review: {
        id: "review-1",
      },
    });
  });

  it("treats repeated unmatched review creation as idempotent", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                message:
                  "duplicate key value violates unique constraint learning_event_reviews_learning_event_key",
              },
            }),
          })),
        })),
      })),
    };

    const result = await createLearningEventReview({
      supabase: supabase as any,
      learningEventId: "event-1",
      reviewStatus: "unmatched",
      reviewReason: "no_matching_homework",
      reviewSummary: {},
    });

    expect(result).toEqual({
      status: "duplicate",
      review: null,
    });
  });
});
