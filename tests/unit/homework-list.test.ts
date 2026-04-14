import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeworkListPage from "@/app/(parent)/homework/page";
import {
  buildHomeworkListView,
  type HomeworkListFilters,
} from "@/lib/homework-list";

const selectChildren = vi.fn();
const selectHomeworks = vi.fn();

vi.mock("@/lib/supabase/client", () => {
  const supabaseClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "parent-1" },
          },
        },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "children") {
        return {
          select: () => ({
            eq: selectChildren,
          }),
        };
      }

      if (table === "homeworks") {
        return {
          select: () => ({
            eq: () => ({
              order: selectHomeworks,
            }),
          }),
          delete: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      return {
        select: () => ({
          eq: vi.fn(),
        }),
      };
    }),
  };

  return {
    createClient: () => supabaseClient,
  };
});

const baseChildren = [
  {
    id: "child-1",
    parent_id: "parent-1",
    name: "Ivy",
    avatar: "🦊",
  },
  {
    id: "child-2",
    parent_id: "parent-1",
    name: "Albert",
    avatar: "🐼",
  },
] as any;

const baseHomeworks = [
  {
    id: "hw-1",
    child_id: "child-1",
    type_id: null,
    type_name: "阅读",
    type_icon: "📖",
    title: "阅读练习",
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
    required_checkpoint_type: "photo",
    created_by: "parent-1",
    created_at: "2026-04-13T08:00:00.000Z",
  },
  {
    id: "hw-2",
    child_id: "child-1",
    type_id: null,
    type_name: "钢琴",
    type_icon: "🎹",
    title: "钢琴加练",
    description: null,
    repeat_type: "once",
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: "2026-04-20",
    repeat_end_date: null,
    point_value: 6,
    estimated_minutes: 30,
    daily_cutoff_time: "19:30",
    is_active: true,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-04-12T08:00:00.000Z",
  },
  {
    id: "hw-3",
    child_id: "child-2",
    type_id: null,
    type_name: "录音",
    type_icon: "🎵",
    title: "朗读录音",
    description: null,
    repeat_type: "weekly",
    repeat_days: [1],
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: 4,
    estimated_minutes: 15,
    daily_cutoff_time: "18:00",
    is_active: true,
    required_checkpoint_type: "audio",
    created_by: "parent-1",
    created_at: "2026-04-11T08:00:00.000Z",
  },
] as any;

function buildFilters(overrides: Partial<HomeworkListFilters> = {}): HomeworkListFilters {
  return {
    selectedChildId: "all",
    date: new Date("2026-04-14T09:00:00+08:00"),
    ...overrides,
  };
}

describe("buildHomeworkListView", () => {
  it("groups all children separately and shows today tasks first inside each group", () => {
    const view = buildHomeworkListView(baseChildren, baseHomeworks, buildFilters());

    expect(view.sections).toHaveLength(2);
    expect(view.sections[0].title).toBe("Ivy");
    expect(view.sections[0].items[0].id).toBe("hw-1");
    expect(view.sections[0].items[0].isDueToday).toBe(true);
    expect(view.sections[0].items[1].id).toBe("hw-2");
    expect(view.sections[1].title).toBe("Albert");
  });

  it("splits a single child into today and other sections", () => {
    const view = buildHomeworkListView(
      baseChildren,
      baseHomeworks,
      buildFilters({ selectedChildId: "child-1" })
    );

    expect(view.sections).toHaveLength(2);
    expect(view.sections[0].title).toBe("今天会出现");
    expect(view.sections[0].items.map((item) => item.id)).toEqual(["hw-1"]);
    expect(view.sections[1].title).toBe("其他作业");
    expect(view.sections[1].items.map((item) => item.id)).toEqual(["hw-2"]);
  });

  it("keeps all homework visible within each child group", () => {
    const view = buildHomeworkListView(baseChildren, baseHomeworks, buildFilters());

    expect(view.sections).toHaveLength(2);
    expect(view.sections[0].items.map((item) => item.id)).toEqual(["hw-1", "hw-2"]);
    expect(view.sections[1].items.map((item) => item.id)).toEqual(["hw-3"]);
  });
});

describe("HomeworkListPage filters", () => {
  beforeEach(() => {
    selectChildren.mockResolvedValue({ data: baseChildren });
    selectHomeworks.mockResolvedValue({ data: baseHomeworks });
  });

  it("defaults to all children and lets parents switch to one child", async () => {
    render(createElement(HomeworkListPage));

    await waitFor(() => {
      expect(screen.getByText("全部孩子")).toBeInTheDocument();
      expect(screen.getByText("阅读练习")).toBeInTheDocument();
      expect(screen.getByText("朗读录音")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /🦊 Ivy/ }));

    expect(screen.getByRole("heading", { name: "今天会出现" })).toBeInTheDocument();
    expect(screen.queryByText("朗读录音")).not.toBeInTheDocument();
    expect(screen.getByText("钢琴加练")).toBeInTheDocument();
  });

  it("offers a copy action that links into the new homework flow", async () => {
    render(createElement(HomeworkListPage));

    await waitFor(() => {
      expect(screen.getByText("阅读练习")).toBeInTheDocument();
    });

    expect(
      screen
        .getAllByRole("link", { name: "复制" })
        .some((link) => link.getAttribute("href") === "/homework/new?copyFrom=hw-1")
    ).toBe(true);
  });

  it("keeps the sidebar focused on child scope only", async () => {
    render(createElement(HomeworkListPage));

    await waitFor(() => {
      expect(screen.getByText("全部孩子")).toBeInTheDocument();
    });

    expect(screen.queryByText("快速搜索")).not.toBeInTheDocument();
    expect(screen.queryByText("证明要求")).not.toBeInTheDocument();
    expect(screen.queryByText("重复规则")).not.toBeInTheDocument();
    expect(screen.getByText("查看范围")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部孩子" })).toBeInTheDocument();
  });
});
