import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChildSelector } from "@/components/parent/ChildSelector";
import { TodayOverview } from "@/components/parent/TodayOverview";
import ParentDashboardPage from "@/app/(parent)/dashboard/page";
import { createClient } from "@/lib/supabase/client";
import { buildParentDashboard, getDefaultSelectedChildId } from "@/lib/parent-dashboard";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

describe("buildParentDashboard", () => {
  const date = "2026-04-08";

  const makeChild = (overrides: Record<string, unknown> = {}) => ({
    id: "child-1",
    parent_id: "parent-1",
    name: "Ivy",
    avatar: "🦊",
    age: null,
    gender: null,
    password_hash: "hash",
    points: 0,
    streak_days: 0,
    last_check_in: null,
    created_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  });

  const makeHomework = (overrides: Record<string, unknown> = {}) => ({
    id: "hw-1",
    child_id: "child-1",
    type_id: null,
    type_name: "默认",
    type_icon: "📝",
    title: "钢琴练习",
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
    created_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  });

  const makeCheckIn = (overrides: Record<string, unknown> = {}) => ({
    id: "check-1",
    homework_id: "hw-1",
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

  const buildFixture = () => ({
    children: [makeChild(), makeChild({ id: "child-2", name: "Albert", avatar: "🐯" })],
    homeworks: [
      makeHomework(),
      makeHomework({
        id: "hw-2",
        title: "阅读练习",
        repeat_type: "weekly",
        repeat_days: [3],
      }),
      makeHomework({
        id: "hw-3",
        title: "英语朗读",
        repeat_type: "once",
        repeat_start_date: date,
      }),
      makeHomework({
        id: "hw-4",
        title: "过期作业",
        repeat_end_date: "2026-04-07",
      }),
      makeHomework({
        id: "hw-5",
        child_id: "child-2",
        title: "数学练习",
        repeat_type: "daily",
        point_value: 5,
      }),
      makeHomework({
        id: "hw-6",
        child_id: "child-2",
        title: "背诵",
        repeat_type: "daily",
        point_value: 4,
      }),
    ],
    checkIns: [
      makeCheckIn({ homework_id: "hw-1", points_earned: 3, awarded_points: 3 }),
      makeCheckIn({
        homework_id: "hw-2",
        completed_at: "2026-04-08T11:00:00.000Z",
        submitted_at: "2026-04-08T11:00:00.000Z",
        points_earned: 2,
        awarded_points: 2,
      }),
      makeCheckIn({
        homework_id: "hw-3",
        completed_at: "2026-04-08T18:30:00",
        submitted_at: "2026-04-08T18:30:00",
        points_earned: 4,
        awarded_points: 4,
        is_late: true,
      }),
      makeCheckIn({
        homework_id: "hw-5",
        child_id: "child-2",
        completed_at: "2026-04-08T09:00:00.000Z",
        submitted_at: "2026-04-08T09:00:00.000Z",
        points_earned: 5,
        awarded_points: 5,
      }),
      makeCheckIn({
        homework_id: "hw-6",
        child_id: "child-2",
        completed_at: "2026-04-08T09:15:00.000Z",
        submitted_at: "2026-04-08T09:15:00.000Z",
        points_earned: 4,
        awarded_points: 4,
      }),
    ],
    date,
  });

  it("builds a top-level summary for each child", () => {
    const result = buildParentDashboard(buildFixture());

    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0].childId).toBe("child-1");
    expect(result.summaries[0].completedCount).toBe(3);
    expect(result.summaries[0].totalCount).toBe(4);
    expect(result.summaries[0].todayPoints).toBe(9);
    expect(result.selectedDayDetails[0].tasks).toHaveLength(4);
  });

  it("marks overdue children ahead of fully completed children", () => {
    const result = buildParentDashboard(buildFixture());

    expect(result.summaries[0].childId).toBe("child-1");
    expect(result.summaries[0].overdueCount).toBeGreaterThan(0);
  });

  it("returns the first summary as the default selected child", () => {
    const result = buildParentDashboard(buildFixture());

    expect(getDefaultSelectedChildId(result.summaries)).toBe("child-1");
  });

  it("builds one calendar entry per day in the selected month", () => {
    const result = buildParentDashboard(buildFixture());

    expect(result.calendarDays).toHaveLength(30);
    expect(result.calendarDays[0]).toMatchObject({
      date: "2026-04-01",
      totalCount: 5,
      completedCount: 0,
      outstandingCount: 5,
    });
    expect(result.calendarDays[7]).toMatchObject({
      date: "2026-04-08",
      totalCount: 6,
      completedCount: 5,
      lateCompletedCount: 1,
      outstandingCount: 1,
    });
  });

  it("calculates the weakest homework types for the month", () => {
    const result = buildParentDashboard({
      children: [makeChild()],
      homeworks: [
        makeHomework({
          id: "hw-math",
          type_name: "数学",
          type_icon: "➗",
          title: "数学练习",
        }),
        makeHomework({
          id: "hw-reading",
          type_name: "阅读",
          type_icon: "📚",
          title: "阅读练习",
          repeat_type: "weekly",
          repeat_days: [3],
        }),
        makeHomework({
          id: "hw-english",
          type_name: "英语",
          type_icon: "🗣️",
          title: "英语朗读",
          repeat_type: "once",
          repeat_start_date: date,
        }),
      ],
      checkIns: [
        makeCheckIn({
          homework_id: "hw-math",
          completed_at: "2026-04-08T09:00:00.000Z",
          submitted_at: "2026-04-08T09:00:00.000Z",
        }),
        makeCheckIn({
          homework_id: "hw-reading",
          completed_at: "2026-04-08T11:00:00.000Z",
          submitted_at: "2026-04-08T11:00:00.000Z",
        }),
      ],
      date,
    });

    expect(result.weakestTypes.map((item) => item.typeName)).toEqual([
      "英语",
      "数学",
      "阅读",
    ]);
    expect(result.weakestTypes[0]).toMatchObject({
      assignedCount: 1,
      completedCount: 0,
      completionRate: 0,
    });
    expect(result.weakestTypes[2]).toMatchObject({
      assignedCount: 5,
      completedCount: 1,
      completionRate: 0.2,
    });
  });
});

describe("ChildSelector summary cards", () => {
  const buildSummaryFixture = () => buildParentDashboard({
    children: [
      {
        id: "child-1",
        parent_id: "parent-1",
        name: "Ivy",
        avatar: "🦊",
        age: null,
        gender: null,
        password_hash: "hash",
        points: 0,
        streak_days: 0,
        last_check_in: null,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "child-2",
        parent_id: "parent-1",
        name: "Albert",
        avatar: "🐯",
        age: null,
        gender: null,
        password_hash: "hash",
        points: 0,
        streak_days: 0,
        last_check_in: null,
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ] as any,
    homeworks: [
      {
        id: "hw-1",
        child_id: "child-1",
        type_id: null,
        type_name: "默认",
        type_icon: "📝",
        title: "钢琴练习",
        description: null,
        repeat_type: "daily",
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
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "hw-2",
        child_id: "child-1",
        type_id: null,
        type_name: "默认",
        type_icon: "📚",
        title: "阅读练习",
        description: null,
        repeat_type: "weekly",
        repeat_days: [3],
        repeat_interval: null,
        repeat_start_date: null,
        repeat_end_date: null,
        point_value: 2,
        estimated_minutes: 20,
        daily_cutoff_time: "20:00",
        is_active: true,
        required_checkpoint_type: null,
        created_by: "parent-1",
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "hw-3",
        child_id: "child-1",
        type_id: null,
        type_name: "默认",
        type_icon: "🗣️",
        title: "英语朗读",
        description: null,
        repeat_type: "once",
        repeat_days: null,
        repeat_interval: null,
        repeat_start_date: "2026-04-08",
        repeat_end_date: null,
        point_value: 4,
        estimated_minutes: 20,
        daily_cutoff_time: "20:00",
        is_active: true,
        required_checkpoint_type: null,
        created_by: "parent-1",
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "hw-4",
        child_id: "child-1",
        type_id: null,
        type_name: "默认",
        type_icon: "📓",
        title: "过期作业",
        description: null,
        repeat_type: "daily",
        repeat_days: null,
        repeat_interval: null,
        repeat_start_date: null,
        repeat_end_date: "2026-04-07",
        point_value: 1,
        estimated_minutes: 20,
        daily_cutoff_time: "20:00",
        is_active: true,
        required_checkpoint_type: null,
        created_by: "parent-1",
        created_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "hw-5",
        child_id: "child-2",
        type_id: null,
        type_name: "默认",
        type_icon: "➗",
        title: "数学练习",
        description: null,
        repeat_type: "daily",
        repeat_days: null,
        repeat_interval: null,
        repeat_start_date: null,
        repeat_end_date: null,
        point_value: 5,
        estimated_minutes: 20,
        daily_cutoff_time: "20:00",
        is_active: true,
        required_checkpoint_type: null,
        created_by: "parent-1",
        created_at: "2026-04-01T00:00:00.000Z",
      },
    ] as any,
    checkIns: [
      {
        id: "check-1",
        homework_id: "hw-1",
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
      },
      {
        id: "check-2",
        homework_id: "hw-2",
        child_id: "child-1",
        completed_at: "2026-04-08T11:00:00.000Z",
        submitted_at: "2026-04-08T11:00:00.000Z",
        points_earned: 2,
        awarded_points: 2,
        is_scored: true,
        is_late: false,
        proof_type: null,
        note: null,
        created_at: "2026-04-08T11:00:00.000Z",
      },
      {
        id: "check-3",
        homework_id: "hw-3",
        child_id: "child-1",
        completed_at: "2026-04-08T18:30:00.000Z",
        submitted_at: "2026-04-08T18:30:00.000Z",
        points_earned: 4,
        awarded_points: 4,
        is_scored: true,
        is_late: true,
        proof_type: null,
        note: null,
        created_at: "2026-04-08T18:30:00.000Z",
      },
      {
        id: "check-4",
        homework_id: "hw-5",
        child_id: "child-2",
        completed_at: "2026-04-08T09:00:00.000Z",
        submitted_at: "2026-04-08T09:00:00.000Z",
        points_earned: 5,
        awarded_points: 5,
        is_scored: true,
        is_late: false,
        proof_type: null,
        note: null,
        created_at: "2026-04-08T09:00:00.000Z",
      },
    ] as any,
    date: "2026-04-08",
  });

  it("renders one summary card per child", () => {
    const result = buildSummaryFixture();

    render(
      createElement(ChildSelector, {
        summaries: result.summaries,
        selectedId: "child-1",
        onSelect: () => {},
      })
    );

    expect(screen.getByText("Ivy")).toBeInTheDocument();
    expect(screen.getByText("Albert")).toBeInTheDocument();
    expect(screen.getAllByText("今日 +5 分")).toHaveLength(2);
  });

  it("shows the top notice for each child", () => {
    const result = buildSummaryFixture();

    render(
      createElement(ChildSelector, {
        summaries: result.summaries,
        selectedId: "child-1",
        onSelect: () => {},
      })
    );

    expect(screen.getByText("有 1 项逾期")).toBeInTheDocument();
    expect(screen.getByText("今天全部完成")).toBeInTheDocument();
  });

  it("calls onSelect when a summary card is clicked", () => {
    const result = buildSummaryFixture();
    const onSelect = vi.fn();

    render(
      createElement(ChildSelector, {
        summaries: result.summaries,
        selectedId: "child-1",
        onSelect,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /Albert/ }));

    expect(onSelect).toHaveBeenCalledWith("child-2");
  });
});

describe("TodayOverview mixed detail panels", () => {
  const detailFixture = {
    summary: {
      childId: "child-1",
      childName: "Ivy",
      avatar: "🦊",
      completedCount: 2,
      totalCount: 4,
      todayPoints: 9,
      overdueCount: 1,
      makeupCount: 1,
      outstandingCount: 2,
      topNotice: "还有 2 项未完成",
    },
    tasks: [
      {
        homeworkId: "hw-1",
        title: "钢琴练习",
        typeIcon: "📝",
        cutoffTime: "20:00",
        proofType: "photo" as const,
        statusText: "逾期完成",
        scored: true,
        awardedPoints: 3,
      },
      {
        homeworkId: "hw-2",
        title: "阅读练习",
        typeIcon: "📚",
        cutoffTime: "21:00",
        proofType: "audio" as const,
        statusText: "待完成",
        scored: false,
        awardedPoints: 0,
      },
    ],
  };

  it("shows summary metrics above the task list", () => {
    render(
      createElement(TodayOverview, {
        detail: detailFixture as any,
        selectedDate: "2026-04-08",
      })
    );

    expect(screen.getByText("2026年4月8日")).toBeInTheDocument();
    expect(screen.getByText("今日任务")).toBeInTheDocument();
  });

  it("shows proof requirement and task status per row", () => {
    render(
      createElement(TodayOverview, {
        detail: detailFixture as any,
        selectedDate: "2026-04-08",
      })
    );

    expect(screen.getByText("需要照片")).toBeInTheDocument();
    expect(screen.getByText("逾期完成")).toBeInTheDocument();
  });
});

describe("ParentDashboardPage wiring", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to the current month and today, showing calendar, detail, and insights", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T09:00:00.000Z"));

    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "parent-1" } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "children") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "child-1",
                      parent_id: "parent-1",
                      name: "Ivy",
                      avatar: "🦊",
                      age: null,
                      gender: null,
                      password_hash: "hash",
                      points: 0,
                      streak_days: 0,
                      last_check_in: null,
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "child-2",
                      parent_id: "parent-1",
                      name: "Albert",
                      avatar: "🐯",
                      age: null,
                      gender: null,
                      password_hash: "hash",
                      points: 0,
                      streak_days: 0,
                      last_check_in: null,
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        if (table === "homeworks") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "hw-1",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "📝",
                      title: "钢琴练习",
                      description: null,
                      repeat_type: "daily",
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
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "hw-2",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "阅读",
                      type_icon: "📚",
                      title: "阅读练习",
                      description: null,
                      repeat_type: "weekly",
                      repeat_days: [3],
                      repeat_interval: null,
                      repeat_start_date: null,
                      repeat_end_date: null,
                      point_value: 2,
                      estimated_minutes: 20,
                      daily_cutoff_time: "20:00",
                      is_active: true,
                      required_checkpoint_type: null,
                      created_by: "parent-1",
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "hw-3",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "英语",
                      type_icon: "🗣️",
                      title: "英语朗读",
                      description: null,
                      repeat_type: "once",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: "2026-04-08",
                      repeat_end_date: null,
                      point_value: 4,
                      estimated_minutes: 20,
                      daily_cutoff_time: "20:00",
                      is_active: true,
                      required_checkpoint_type: null,
                      created_by: "parent-1",
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        if (table === "check_ins") {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "check-1",
                      homework_id: "hw-1",
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
                    },
                    {
                      id: "check-2",
                      homework_id: "hw-2",
                      child_id: "child-1",
                      completed_at: "2026-04-08T11:00:00.000Z",
                      submitted_at: "2026-04-08T11:00:00.000Z",
                      points_earned: 2,
                      awarded_points: 2,
                      is_scored: true,
                      is_late: false,
                      proof_type: null,
                      note: null,
                      created_at: "2026-04-08T11:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(createElement(ParentDashboardPage));
    await vi.runAllTimersAsync();

    expect(screen.getByText("Ivy")).toBeInTheDocument();
    expect(screen.getByText("Albert")).toBeInTheDocument();
    expect(screen.getByText("本月打卡日历")).toBeInTheDocument();
    expect(screen.getByText("2026年4月8日")).toBeInTheDocument();
    expect(screen.getByText("本月薄弱类型")).toBeInTheDocument();
  });

  it("shows all child summaries above the selected child detail", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T09:00:00.000Z"));

    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "parent-1" } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "children") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "child-1",
                      parent_id: "parent-1",
                      name: "Ivy",
                      avatar: "🦊",
                      age: null,
                      gender: null,
                      password_hash: "hash",
                      points: 0,
                      streak_days: 0,
                      last_check_in: null,
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "child-2",
                      parent_id: "parent-1",
                      name: "Albert",
                      avatar: "🐯",
                      age: null,
                      gender: null,
                      password_hash: "hash",
                      points: 0,
                      streak_days: 0,
                      last_check_in: null,
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        if (table === "homeworks") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "hw-1",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "📝",
                      title: "钢琴练习",
                      description: null,
                      repeat_type: "daily",
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
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "hw-2",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "📚",
                      title: "阅读练习",
                      description: null,
                      repeat_type: "weekly",
                      repeat_days: [3],
                      repeat_interval: null,
                      repeat_start_date: null,
                      repeat_end_date: null,
                      point_value: 2,
                      estimated_minutes: 20,
                      daily_cutoff_time: "20:00",
                      is_active: true,
                      required_checkpoint_type: null,
                      created_by: "parent-1",
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "hw-3",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "🗣️",
                      title: "英语朗读",
                      description: null,
                      repeat_type: "once",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: "2026-04-08",
                      repeat_end_date: null,
                      point_value: 4,
                      estimated_minutes: 20,
                      daily_cutoff_time: "20:00",
                      is_active: true,
                      required_checkpoint_type: null,
                      created_by: "parent-1",
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "hw-4",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "📓",
                      title: "过期作业",
                      description: null,
                      repeat_type: "daily",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: null,
                      repeat_end_date: "2026-04-07",
                      point_value: 1,
                      estimated_minutes: 20,
                      daily_cutoff_time: "20:00",
                      is_active: true,
                      required_checkpoint_type: null,
                      created_by: "parent-1",
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                    {
                      id: "hw-5",
                      child_id: "child-2",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "➗",
                      title: "数学练习",
                      description: null,
                      repeat_type: "daily",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: null,
                      repeat_end_date: null,
                      point_value: 5,
                      estimated_minutes: 20,
                      daily_cutoff_time: "20:00",
                      is_active: true,
                      required_checkpoint_type: null,
                      created_by: "parent-1",
                      created_at: "2026-04-01T00:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        if (table === "check_ins") {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "check-1",
                      homework_id: "hw-1",
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
                    },
                    {
                      id: "check-2",
                      homework_id: "hw-2",
                      child_id: "child-1",
                      completed_at: "2026-04-08T11:00:00.000Z",
                      submitted_at: "2026-04-08T11:00:00.000Z",
                      points_earned: 2,
                      awarded_points: 2,
                      is_scored: true,
                      is_late: false,
                      proof_type: null,
                      note: null,
                      created_at: "2026-04-08T11:00:00.000Z",
                    },
                    {
                      id: "check-3",
                      homework_id: "hw-3",
                      child_id: "child-1",
                      completed_at: "2026-04-08T18:30:00.000Z",
                      submitted_at: "2026-04-08T18:30:00.000Z",
                      points_earned: 4,
                      awarded_points: 4,
                      is_scored: true,
                      is_late: true,
                      proof_type: null,
                      note: null,
                      created_at: "2026-04-08T18:30:00.000Z",
                    },
                    {
                      id: "check-4",
                      homework_id: "hw-5",
                      child_id: "child-2",
                      completed_at: "2026-04-08T09:00:00.000Z",
                      submitted_at: "2026-04-08T09:00:00.000Z",
                      points_earned: 5,
                      awarded_points: 5,
                      is_scored: true,
                      is_late: false,
                      proof_type: null,
                      note: null,
                      created_at: "2026-04-08T09:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(createElement(ParentDashboardPage));
    await vi.runAllTimersAsync();

    expect(screen.getByText("Ivy")).toBeInTheDocument();
    expect(screen.getByText("Albert")).toBeInTheDocument();
    expect(screen.getByText("本月打卡日历")).toBeInTheDocument();
    expect(screen.getByText("今日任务")).toBeInTheDocument();
  });
});
