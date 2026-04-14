import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChildSelector } from "@/components/parent/ChildSelector";
import { ParentCheckInHeatmap } from "@/components/parent/ParentCheckInHeatmap";
import { ParentChildTaskList } from "@/components/parent/ParentChildTaskList";
import { ParentDayDetailPanel } from "@/components/parent/ParentDayDetailPanel";
import { ParentMonthCalendar } from "@/components/parent/ParentMonthCalendar";
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
    point_deduction: 0,
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

  it("builds month-aware stats, tooltips, heatmap data, and reminder state", () => {
    const result = buildParentDashboard({
      children: [makeChild()],
      homeworks: [
        makeHomework({
          id: "hw-may",
          title: "五月练习",
          repeat_type: "once",
          repeat_start_date: "2026-05-03",
          repeat_end_date: "2026-05-31",
        }),
        makeHomework({
          id: "hw-april",
          title: "四月练习",
          repeat_type: "once",
          repeat_start_date: "2026-04-03",
          repeat_end_date: "2026-04-30",
        }),
      ],
      checkIns: [
        makeCheckIn({
          homework_id: "hw-may",
          completed_at: "2026-05-03T11:15:00",
          submitted_at: "2026-05-03T11:15:00",
          points_earned: 5,
          awarded_points: 5,
        }),
        makeCheckIn({
          homework_id: "hw-april",
          completed_at: "2026-04-08T11:15:00.000Z",
          submitted_at: "2026-04-08T11:15:00.000Z",
          points_earned: 5,
          awarded_points: 5,
        }),
      ],
      date: "2026-05-03",
      month: "2026-05",
      reminderStates: [
        {
          homeworkId: "hw-may",
          targetDate: "2026-05-03",
          status: "sent_sms" as const,
          escalateAfter: "2026-05-03T12:00:00.000Z",
        },
      ],
    });

    expect(result.monthlyStats).toMatchObject({
      completionRate: 1,
      onTimeRate: 1,
      totalPoints: 5,
      incompleteCount: 0,
    });
    expect(result.calendarDays).toHaveLength(31);
    expect(result.calendarDays[2]).toMatchObject({
      date: "2026-05-03",
      totalCount: 1,
      completedCount: 1,
      outstandingCount: 0,
      tooltip: {
        assignedCount: 1,
        completedCount: 1,
        lateCompletedCount: 0,
        pendingTitles: [],
      },
    });
    expect(result.checkInHeatmap.some((bucket) => bucket.hour === 11 && bucket.count === 1)).toBe(true);
    expect(result.selectedDayDetails[0].tasks[0]).toMatchObject({
      title: "五月练习",
      reminderState: {
        homeworkId: "hw-may",
        targetDate: "2026-05-03",
        status: "sent_sms",
        escalateAfter: "2026-05-03T12:00:00.000Z",
      },
    });
  });

  it("builds a top-level summary for each child", () => {
    const result = buildParentDashboard(buildFixture());
    const childOneSummary = result.summaries.find((summary) => summary.childId === "child-1");
    const childOneDetail = result.selectedDayDetails.find(
      (detail) => detail.summary.childId === "child-1"
    );

    expect(result.summaries).toHaveLength(2);
    expect(childOneSummary).toMatchObject({
      childId: "child-1",
      completedCount: 3,
      totalCount: 3,
      todayPoints: 9,
    });
    expect(childOneDetail?.tasks).toHaveLength(3);
  });

  it("excludes expired recurring tasks after repeat_end_date", () => {
    const result = buildParentDashboard(buildFixture());
    const childOneDetail = result.selectedDayDetails.find(
      (detail) => detail.summary.childId === "child-1"
    );

    expect(childOneDetail?.tasks.map((task) => task.title)).not.toContain("过期作业");
    expect(
      result.summaries.find((summary) => summary.childId === "child-1")
    ).toMatchObject({
      overdueCount: 0,
      outstandingCount: 0,
    });
  });

  it("returns the first summary as the default selected child", () => {
    const result = buildParentDashboard(buildFixture());

    expect(getDefaultSelectedChildId(result.summaries)).toBe(result.summaries[0].childId);
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
      totalCount: 5,
      completedCount: 5,
      lateCompletedCount: 1,
      outstandingCount: 0,
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

    expect(screen.getByText("还有 1 项待完成")).toBeInTheDocument();
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
    expect(screen.getAllByText("当天任务").length).toBeGreaterThan(0);
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
    expect(screen.getByRole("button", { name: "📎 附件" })).toBeInTheDocument();
  });
});

describe("ParentDashboardPage wiring", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the linked task overview, compact calendar, and side-by-side analysis blocks", async () => {
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
    const todayHeading = screen.getAllByText("当天任务")[0];
    const calendarHeading = screen.getByText("本月进度日历");
    const heatmapHeading = screen.getByText("本月时段热力图");
    const weakestTypesHeading = screen.getByText("本月薄弱类型");

    expect(todayHeading).toBeInTheDocument();
    expect(screen.getByText("2026年4月8日")).toBeInTheDocument();
    expect(calendarHeading).toBeInTheDocument();
    expect(screen.getByText("完成率")).toBeInTheDocument();
    expect(heatmapHeading).toBeInTheDocument();
    expect(weakestTypesHeading).toBeInTheDocument();
    expect(
      todayHeading.compareDocumentPosition(calendarHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      calendarHeading.compareDocumentPosition(heatmapHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      heatmapHeading.compareDocumentPosition(weakestTypesHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("switches months from the calendar controls and refreshes monthly labels", async () => {
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
                      id: "hw-april",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "默认",
                      type_icon: "📝",
                      title: "四月练习",
                      description: null,
                      repeat_type: "once",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: "2026-04-08",
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
                      id: "hw-may",
                      child_id: "child-1",
                      type_id: null,
                      type_name: "阅读",
                      type_icon: "📚",
                      title: "五月阅读",
                      description: null,
                      repeat_type: "once",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: "2026-05-03",
                      repeat_end_date: null,
                      point_value: 4,
                      estimated_minutes: 15,
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
                      id: "check-april",
                      homework_id: "hw-april",
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
                      id: "check-may",
                      homework_id: "hw-may",
                      child_id: "child-1",
                      completed_at: "2026-05-03T11:00:00.000Z",
                      submitted_at: "2026-05-03T11:00:00.000Z",
                      points_earned: 4,
                      awarded_points: 4,
                      is_scored: true,
                      is_late: false,
                      proof_type: null,
                      note: null,
                      created_at: "2026-05-03T11:00:00.000Z",
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

    expect(screen.getByText("2026年4月")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "下个月" }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("2026年5月")).toBeInTheDocument();
    expect(screen.getByText("2026年5月1日")).toBeInTheDocument();
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
    expect(screen.getByText("本月进度日历")).toBeInTheDocument();
    expect(screen.getAllByText("当天任务").length).toBeGreaterThan(0);
  });

  it("recovers the selected child when the current id disappears from the summaries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T09:00:00.000Z"));

    let childrenFetchCount = 0;
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
              eq: () => {
                childrenFetchCount += 1;
                return Promise.resolve({
                  data:
                    childrenFetchCount === 1
                      ? [
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
                        ]
                      : [
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
                });
              },
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
                      repeat_type: "daily",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: null,
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
                      id: "hw-3",
                      child_id: "child-2",
                      type_id: null,
                      type_name: "阅读",
                      type_icon: "📚",
                      title: "阅读练习",
                      description: null,
                      repeat_type: "daily",
                      repeat_days: null,
                      repeat_interval: null,
                      repeat_start_date: null,
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
                      homework_id: "hw-3",
                      child_id: "child-2",
                      completed_at: "2026-04-08T11:00:00.000Z",
                      submitted_at: "2026-04-08T11:00:00.000Z",
                      points_earned: 4,
                      awarded_points: 4,
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

    expect(screen.getByRole("button", { name: /Ivy/ })).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "下个月" }));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByRole("button", { name: /Albert/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Albert")).toBeInTheDocument();
  });

  it("renders a logout action in the header", async () => {
    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "parent-1" } } },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === "children") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [] }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(createElement(ParentDashboardPage));

    fireEvent.click(await screen.findByRole("button", { name: "退出登录" }));

    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
  });
});

describe("Parent attachment previews and monthly cluster", () => {
  it("opens a modal preview for completed child attachments", async () => {
    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "parent-1" } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "check_ins") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    lt: () => ({
                      order: () => ({
                        limit: () =>
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
                                proof_type: "photo",
                                note: null,
                                created_at: "2026-04-08T10:00:00.000Z",
                              },
                            ],
                          }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "attachments") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "att-1",
                      check_in_id: "check-1",
                      type: "photo",
                      storage_path: "parent-1/check-1/photo.png",
                      created_at: "2026-04-08T10:00:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: () => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://example.com/photo.png" },
            error: null,
          }),
        }),
      },
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(
      createElement(ParentDayDetailPanel, {
        detail: {
          summary: {
            childId: "child-1",
            childName: "Ivy",
            avatar: "🦊",
            completedCount: 1,
            totalCount: 1,
            todayPoints: 3,
            overdueCount: 0,
            makeupCount: 0,
            outstandingCount: 0,
            topNotice: "今天全部完成",
          },
          tasks: [
            {
              homeworkId: "hw-1",
              title: "钢琴练习",
              typeIcon: "📝",
              cutoffTime: "20:00",
              proofType: "photo" as const,
              statusText: "已完成",
              scored: true,
              awardedPoints: 3,
            },
          ],
        } as any,
        selectedDate: "2026-04-08",
      })
    );

    fireEvent.click(await screen.findByRole("button", { name: "📎 附件" }));

    expect(await screen.findByText("附件预览")).toBeInTheDocument();
    expect(screen.getByAltText("钢琴练习 附件 1")).toBeInTheDocument();
  });

  it("hides attachment preview for unfinished tasks", () => {
    render(
      createElement(ParentChildTaskList, {
        tasks: [
          {
            homeworkId: "hw-1",
            title: "钢琴练习",
            typeIcon: "📝",
            cutoffTime: "20:00",
            proofType: "photo" as const,
            statusText: "待完成",
            scored: false,
            awardedPoints: 0,
          },
        ],
        childId: "child-1",
        selectedDate: "2026-04-08",
      } as any)
    );

    expect(screen.queryByRole("button", { name: "📎 附件" })).not.toBeInTheDocument();
  });

  it("matches reminder state by homework and target date", () => {
    render(
      createElement(ParentChildTaskList, {
        tasks: [
          {
            homeworkId: "hw-1",
            title: "钢琴练习",
            typeIcon: "📝",
            cutoffTime: "20:00",
            proofType: null,
            statusText: "已完成",
            scored: true,
            awardedPoints: 3,
          },
        ],
        childId: "child-1",
        selectedDate: "2026-04-08",
        reminderStates: [
          {
            homeworkId: "hw-1",
            targetDate: "2026-04-07",
            status: "sent_sms",
            escalateAfter: null,
          },
        ],
      } as any)
    );

    expect(screen.getByRole("button", { name: "🔔 提醒" })).toBeInTheDocument();
    expect(
      screen.queryByText("已短信提醒 · 2小时后未完成将电话提醒")
    ).not.toBeInTheDocument();
  });

  it("loads attachment previews using the local day window", async () => {
    const expectedStart = new Date("2026-04-08T00:00:00").toISOString();
    const expectedEnd = new Date("2026-04-08T23:59:59.999").toISOString();

    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "parent-1" } } },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "check_ins") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: (_field: string, start: string) => ({
                    lt: (_field: string, end: string) => ({
                      order: () => ({
                        limit: () =>
                          Promise.resolve({
                            data:
                              start === expectedStart && end === expectedEnd
                                ? [
                                    {
                                      id: "check-1",
                                      homework_id: "hw-1",
                                      child_id: "child-1",
                                      completed_at: "2026-04-07T18:30:00.000Z",
                                      submitted_at: "2026-04-07T18:30:00.000Z",
                                      points_earned: 3,
                                      awarded_points: 3,
                                      is_scored: true,
                                      is_late: false,
                                      proof_type: "photo",
                                      note: null,
                                      created_at: "2026-04-07T18:30:00.000Z",
                                    },
                                  ]
                                : [],
                          }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "attachments") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "att-1",
                      check_in_id: "check-1",
                      type: "photo",
                      storage_path: "parent-1/check-1/photo.png",
                      created_at: "2026-04-07T18:30:00.000Z",
                    },
                  ],
                }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: () => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://example.com/photo.png" },
            error: null,
          }),
        }),
      },
    };

    vi.mocked(createClient).mockReturnValue(mockSupabase as any);

    render(
      createElement(ParentChildTaskList, {
        tasks: [
          {
            homeworkId: "hw-1",
            title: "钢琴练习",
            typeIcon: "📝",
            cutoffTime: "20:00",
            proofType: "photo" as const,
            statusText: "已完成",
            scored: true,
            awardedPoints: 3,
          },
        ],
        childId: "child-1",
        selectedDate: "2026-04-08",
      } as any)
    );

    fireEvent.click(await screen.findByRole("button", { name: "📎 附件" }));

    expect(await screen.findByText("附件预览")).toBeInTheDocument();
    expect(screen.getByAltText("钢琴练习 附件 1")).toBeInTheDocument();
  });

  it("shows the compact calendar legend and monthly stats without task-title clutter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T09:00:00.000Z"));

    render(
      createElement(ParentMonthCalendar, {
        days: [
          {
            date: "2026-04-01",
            totalCount: 2,
            completedCount: 1,
            lateCompletedCount: 0,
            outstandingCount: 1,
            tooltip: {
              assignedCount: 2,
              completedCount: 1,
              lateCompletedCount: 0,
              pendingTitles: ["阅读练习"],
            },
          },
          {
            date: "2026-04-02",
            totalCount: 0,
            completedCount: 0,
            lateCompletedCount: 0,
            outstandingCount: 0,
            tooltip: {
              assignedCount: 0,
              completedCount: 0,
              lateCompletedCount: 0,
              pendingTitles: [],
            },
          },
        ],
        selectedDate: "2026-04-01",
        selectedMonth: "2026-04",
        monthlyStats: {
          completionRate: 0.5,
          onTimeRate: 0.5,
          totalPoints: 9,
          incompleteCount: 1,
        },
        onSelectDate: () => {},
        onPreviousMonth: () => {},
        onNextMonth: () => {},
      } as any)
    );

    expect(screen.getByText("完成率")).toBeInTheDocument();
    expect(screen.getByText("未完成数")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("未开始")).toBeInTheDocument();
    expect(screen.getByText("今")).toBeInTheDocument();
    expect(screen.queryByText("当前查看：2026年4月1日")).not.toBeInTheDocument();
    expect(screen.queryByText("阅读练习")).not.toBeInTheDocument();
    const selectedDayButton = screen.getByRole("button", {
      name: "2026-04-01 进行中，完成 1/2",
    });
    expect(selectedDayButton).toBeInTheDocument();
    expect(selectedDayButton).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the monthly heatmap with separate time labels below each block", () => {
    render(
      createElement(ParentCheckInHeatmap, {
        buckets: [
          { hour: 8, count: 1 },
          { hour: 19, count: 3 },
          { hour: 20, count: 2 },
        ],
      })
    );

    expect(screen.getByText("本月时段热力图")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText("高峰")).toBeInTheDocument();
  });
});
