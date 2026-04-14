import { describe, expect, it } from "vitest";
import {
  buildChildMonthlyProgress,
  getAdjacentMonth,
  isFutureMonth,
} from "@/lib/child-progress";

describe("buildChildMonthlyProgress", () => {
  const makeHomework = (overrides: Record<string, unknown> = {}) => ({
    id: "hw-1",
    child_id: "child-1",
    type_id: null,
    type_name: "数学",
    type_icon: "➗",
    title: "数学口算",
    description: null,
    repeat_type: "daily" as const,
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: 3,
    estimated_minutes: 15,
    daily_cutoff_time: "20:00",
    is_active: true,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  });

  const makeCheckIn = (overrides: Record<string, unknown> = {}) => ({
    id: "check-1",
    homework_id: "hw-1",
    child_id: "child-1",
    completed_at: "2026-04-02T16:30:00",
    submitted_at: "2026-04-02T16:30:00",
    points_earned: 3,
    awarded_points: 3,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-04-02T16:30:00",
    ...overrides,
  });

  it("builds a month calendar, type insights, heatmap, and study habit advice", () => {
    const dashboard = buildChildMonthlyProgress({
      month: "2026-04",
      homeworks: [
        makeHomework(),
        makeHomework({
          id: "hw-reading",
          type_name: "阅读",
          type_icon: "📚",
          title: "阅读 20 分钟",
          repeat_type: "weekly",
          repeat_days: [5],
        }),
        makeHomework({
          id: "hw-english",
          type_name: "英语",
          type_icon: "🗣️",
          title: "英语朗读",
          repeat_type: "once",
          repeat_start_date: "2026-04-10",
        }),
      ],
      checkIns: [
        makeCheckIn(),
        makeCheckIn({
          id: "check-2",
          homework_id: "hw-reading",
          completed_at: "2026-04-03T19:20:00",
          submitted_at: "2026-04-03T19:20:00",
          points_earned: 3,
          awarded_points: 3,
          is_late: true,
        }),
        makeCheckIn({
          id: "check-3",
          homework_id: "hw-1",
          completed_at: "2026-04-04T08:10:00",
          submitted_at: "2026-04-04T08:10:00",
          points_earned: 3,
          awarded_points: 3,
          is_late: false,
        }),
      ],
    });

    expect(dashboard.summary).toMatchObject({
      monthLabel: "2026年4月",
      totalAssigned: 35,
      completedCount: 3,
      lateCount: 1,
      activeDays: 3,
    });
    expect(dashboard.calendarDays).toHaveLength(30);
    expect(dashboard.calendarDays[1]).toMatchObject({
      date: "2026-04-02",
      totalCount: 1,
      completedCount: 1,
      completionRate: 1,
    });
    expect(dashboard.weakestTypes[0]).toMatchObject({
      typeName: "英语",
      completionRate: 0,
    });
    expect(dashboard.strongestTypes[0]).toMatchObject({
      typeName: "阅读",
      completedCount: 1,
    });
    expect(
      dashboard.timeHeatmap.find((bucket) => bucket.hour === 8)?.count
    ).toBe(1);
    expect(
      dashboard.timeHeatmap.find((bucket) => bucket.hour === 16)?.count
    ).toBe(1);
    expect(
      dashboard.habitInsights.some((item) => item.title.includes("补打卡"))
    ).toBe(true);
  });
});

describe("child progress month helpers", () => {
  it("moves between adjacent months across year boundaries", () => {
    expect(getAdjacentMonth("2026-01", -1)).toBe("2025-12");
    expect(getAdjacentMonth("2026-12", 1)).toBe("2027-01");
  });

  it("detects future months relative to the current month", () => {
    expect(isFutureMonth("2026-05", "2026-04")).toBe(true);
    expect(isFutureMonth("2026-04", "2026-04")).toBe(false);
    expect(isFutureMonth("2026-03", "2026-04")).toBe(false);
  });
});
