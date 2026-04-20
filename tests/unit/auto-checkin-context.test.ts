import { describe, expect, it, vi } from "vitest";
import { loadAutoCheckinContext } from "@/lib/learning-event-auto-checkins";

describe("loadAutoCheckinContext", () => {
  it("loads the child homeworks visible on the local date and indexes existing same-day check-ins by homework", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "homeworks") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "hw-daily",
                    child_id: "child-1",
                    title: "Math",
                    repeat_type: "daily",
                    repeat_days: null,
                    repeat_interval: null,
                    repeat_start_date: null,
                    repeat_end_date: null,
                    point_value: 3,
                    estimated_minutes: 20,
                    required_checkpoint_type: null,
                    is_active: true,
                  },
                  {
                    id: "hw-weekly",
                    child_id: "child-1",
                    title: "Weekly Reading",
                    repeat_type: "weekly",
                    repeat_days: [3],
                    repeat_interval: null,
                    repeat_start_date: null,
                    repeat_end_date: null,
                    point_value: 4,
                    estimated_minutes: 30,
                    required_checkpoint_type: null,
                    is_active: true,
                  },
                  {
                    id: "hw-hidden",
                    child_id: "child-1",
                    title: "Friday only",
                    repeat_type: "weekly",
                    repeat_days: [5],
                    repeat_interval: null,
                    repeat_start_date: null,
                    repeat_end_date: null,
                    point_value: 2,
                    estimated_minutes: 10,
                    required_checkpoint_type: null,
                    is_active: true,
                  },
                ],
                error: null,
              }),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "check-1",
                      homework_id: "hw-daily",
                      child_id: "child-1",
                      completed_at: "2026-04-22T09:00:00.000Z",
                    },
                  ],
                  error: null,
                }),
              })),
            })),
          })),
        };
      }),
    };

    const result = await loadAutoCheckinContext({
      supabase: supabase as any,
      childId: "child-1",
      localDateKey: "2026-04-22",
    });

    expect(result.candidateHomeworks.map((homework) => homework.id)).toEqual([
      "hw-daily",
      "hw-weekly",
    ]);
    expect(result.existingCheckInsByHomeworkId).toEqual({
      "hw-daily": {
        id: "check-1",
      },
    });
  });
});
