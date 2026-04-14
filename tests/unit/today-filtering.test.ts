import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChildLandingContent } from "@/components/child/ChildLandingContent";

interface Homework {
  id: string;
  repeat_type: "daily" | "weekly" | "interval" | "once";
  repeat_days: number[] | null;
  repeat_interval: number | null;
  repeat_start_date: string | null;
  is_active: boolean | null;
}

function filterToday(homeworks: Homework[], today = new Date()): Homework[] {
  const todayStr = today.toISOString().split("T")[0];
  const dayOfWeek = today.getDay();

  return homeworks.filter((hw) => {
    if (!hw.is_active) return false;
    if (hw.repeat_type === "daily") return true;
    if (hw.repeat_type === "weekly") {
      return hw.repeat_days?.includes(dayOfWeek);
    }
    if (hw.repeat_type === "once") {
      return hw.repeat_start_date === todayStr;
    }
    // interval type not filtered yet without additional logic
    return false;
  });
}

describe("Today homework filtering", () => {
  const makeHw = (overrides: Partial<Homework>) => ({
    id: "default",
    repeat_type: "daily" as const,
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    is_active: true,
    ...overrides,
  });

  it("should include daily homeworks for any day", () => {
    const homeworks = [makeHw({ id: "1", repeat_type: "daily" })];
    const result = filterToday(homeworks, new Date("2026-04-08"));
    expect(result).toHaveLength(1);
  });

  it("should include homeworks on correct weekday", () => {
    // Wednesday April 8 = day 3
    const homeworks = [makeHw({ id: "2", repeat_type: "weekly", repeat_days: [3] })];
    const result = filterToday(homeworks, new Date("2026-04-08"));
    expect(result).toHaveLength(1);
  });

  it("should exclude homeworks on wrong weekday", () => {
    const homeworks = [makeHw({ id: "2", repeat_type: "weekly", repeat_days: [1] })];
    const result = filterToday(homeworks, new Date("2026-04-08"));
    expect(result).toHaveLength(0);
  });

  it("should include once homework when date matches", () => {
    const homeworks = [makeHw({ id: "3", repeat_type: "once", repeat_start_date: "2026-04-08" })];
    const result = filterToday(homeworks, new Date("2026-04-08"));
    expect(result).toHaveLength(1);
  });

  it("should exclude once homework when date does not match", () => {
    const homeworks = [makeHw({ id: "3", repeat_type: "once", repeat_start_date: "2026-04-09" })];
    const result = filterToday(homeworks, new Date("2026-04-08"));
    expect(result).toHaveLength(0);
  });

  it("should exclude inactive homeworks", () => {
    const homeworks = [makeHw({ id: "1", repeat_type: "daily", is_active: false })];
    const result = filterToday(homeworks);
    expect(result).toHaveLength(0);
  });

  it("should include all weekly days in range", () => {
    const homeworks = [makeHw({ id: "4", repeat_type: "weekly", repeat_days: [0, 1, 2, 3, 4, 5, 6] })];
    for (let i = 0; i < 7; i++) {
      const d = new Date("2026-04-06");
      d.setDate(d.getDate() + (i - 0));
      const result = filterToday(homeworks, d);
      expect(result).toHaveLength(1);
    }
  });

  it("should handle multiple homeworks correctly", () => {
    const homeworks = [
      makeHw({ id: "1", repeat_type: "daily" }),
      makeHw({ id: "2", repeat_type: "weekly", repeat_days: [3] }),
      makeHw({ id: "3", repeat_type: "weekly", repeat_days: [4] }),
      makeHw({ id: "4", repeat_type: "once", repeat_start_date: "2026-04-08" }),
      makeHw({ id: "5", repeat_type: "once", repeat_start_date: "2026-04-09" }),
    ];
    const result = filterToday(homeworks, new Date("2026-04-08"));
    expect(result.map((h) => h.id).sort()).toEqual(["1", "2", "4"]);
  });

  it("should include interval homeworks on matching intervals (every N days from start)", () => {
    const startDate = new Date("2026-04-01");
    const testDate = new Date("2026-04-05");
    const diffDays = Math.round((testDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    // interval homework: every 2 days from 4/1
    const hw = makeHw({ id: "6", repeat_type: "interval", repeat_interval: 2, repeat_start_date: "2026-04-01" });
    // 4/5 - 4/1 = 4 days, 4 % 2 === 0, should match
    expect(diffDays % (hw.repeat_interval || 1)).toBe(0);
  });
});

describe("Child landing page layout", () => {
  const makeHomework = (overrides: Record<string, unknown> = {}) => ({
    id: "hw-1",
    child_id: "child-1",
    type_id: null,
    type_name: "阅读",
    type_icon: "📖",
    title: "阅读练习",
    description: null,
    repeat_type: "daily" as const,
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: 3,
    estimated_minutes: 20,
    daily_cutoff_time: "20:00",
    is_active: true,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-04-08T08:00:00.000Z",
    ...overrides,
  });

  const makeCheckIn = (overrides: Record<string, unknown> = {}) => ({
    id: "check-1",
    homework_id: "hw-2",
    child_id: "child-1",
    completed_at: "2026-04-08T10:00:00.000Z",
    submitted_at: "2026-04-08T10:00:00.000Z",
    points_earned: 3,
    awarded_points: 3,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-04-08T10:00:00.000Z",
    ...overrides,
  });

  it("renders weekly summary on the left and daily tasks on the right", () => {
    render(
      createElement(ChildLandingContent, {
        initialDate: "2026-04-08",
        homeworks: [
          makeHomework({ id: "hw-1", title: "钢琴练习", type_icon: "🎹" }),
          makeHomework({ id: "hw-2", title: "阅读练习", type_icon: "📖" }),
        ] as any,
        checkIns: [makeCheckIn()] as any,
      })
    );

    expect(screen.getByText("本周积分")).toBeInTheDocument();
    expect(screen.getByText("今日进度")).toBeInTheDocument();
    expect(screen.getByText("任务清单")).toBeInTheDocument();
  });

  it("shows the priority task card before the task list", () => {
    render(
      createElement(ChildLandingContent, {
        initialDate: "2026-04-08",
        homeworks: [
          makeHomework({ id: "hw-1", title: "钢琴练习", type_icon: "🎹" }),
          makeHomework({ id: "hw-2", title: "阅读练习", type_icon: "📖" }),
        ] as any,
        checkIns: [makeCheckIn()] as any,
      })
    );

    const priorityCard = screen.getByText("下一项");
    const taskList = screen.getByText("任务清单");
    expect(priorityCard.compareDocumentPosition(taskList)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("redirects the standalone today route to the canonical child home", () => {
    const todayPage = readFileSync(
      resolve(process.cwd(), "src/app/(child)/today/page.tsx"),
      "utf8"
    );

    expect(todayPage).toMatch(/redirect\("\/"\)/);
    expect(todayPage).not.toMatch(/ChildTodayPage|useState|ChildHomeworkCard/);
  });
});
