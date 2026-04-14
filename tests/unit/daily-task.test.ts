import { describe, expect, it } from "vitest";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";

type HomeworkFixture = {
  id: string;
  title: string;
  type_icon: string | null;
  estimated_minutes: number | null;
  point_value: number | null;
  daily_cutoff_time: string | null;
  required_checkpoint_type: "photo" | "audio" | null;
  repeat_type: "daily" | "weekly" | "interval" | "once";
  repeat_days: number[] | null;
  repeat_interval: number | null;
  repeat_start_date: string | null;
  is_active: boolean | null;
};

type CheckInFixture = {
  homework_id: string;
  completed_at: string | null;
  is_scored?: boolean;
  is_late?: boolean;
  awarded_points?: number;
};

function makeHomework(overrides: Partial<HomeworkFixture> = {}): HomeworkFixture {
  return {
    id: "hw-1",
    title: "Read",
    type_icon: "📖",
    estimated_minutes: 20,
    point_value: 4,
    daily_cutoff_time: "20:00",
    required_checkpoint_type: null,
    repeat_type: "daily",
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    is_active: true,
    ...overrides,
  };
}

function makeCheckIn(overrides: Partial<CheckInFixture> = {}): CheckInFixture {
  return {
    homework_id: "hw-1",
    completed_at: "2026-04-11T10:00:00.000Z",
    is_scored: false,
    is_late: false,
    awarded_points: 0,
    ...overrides,
  };
}

describe("buildDailyTaskStatuses", () => {
  it("marks first same-day completion as scored", () => {
    const result = buildDailyTaskStatuses(
      [makeHomework()],
      [
        makeCheckIn({
          is_scored: true,
          awarded_points: 4,
        }),
      ] as any,
      "2026-04-11"
    );

    expect(result[0].completed).toBe(true);
    expect(result[0].scored).toBe(true);
    expect(result[0].awardedPoints).toBe(4);
  });

  it("keeps repeat submissions completed but not scored", () => {
    const result = buildDailyTaskStatuses(
      [makeHomework()],
      [
        makeCheckIn({
          completed_at: "2026-04-11T08:00:00.000Z",
          is_scored: false,
          awarded_points: 0,
        }),
        makeCheckIn({
          completed_at: "2026-04-11T09:00:00.000Z",
          is_scored: false,
          awarded_points: 0,
        }),
      ] as any,
      "2026-04-11"
    );

    expect(result[0].completed).toBe(true);
    expect(result[0].submissionCount).toBe(2);
    expect(result[0].scored).toBe(false);
  });
});
