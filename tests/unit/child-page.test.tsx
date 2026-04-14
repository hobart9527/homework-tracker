import { createElement } from "react";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChildLandingPage from "@/app/(child)/page";
import { createClient } from "@/lib/supabase/client";

const homeworkRows = [
  {
    id: "hw-1",
    child_id: "child-1",
    type_id: null,
    type_name: "数学",
    type_icon: "➗",
    title: "数学口算",
    description: null,
    repeat_type: "daily",
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
  },
  {
    id: "hw-2",
    child_id: "child-1",
    type_id: null,
    type_name: "阅读",
    type_icon: "📚",
    title: "阅读 20 分钟",
    description: null,
    repeat_type: "daily",
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: 8,
    estimated_minutes: 20,
    daily_cutoff_time: "20:00",
    is_active: false,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-04-01T00:00:00.000Z",
  },
];

const checkInRows = [
  {
    id: "ci-current-1",
    homework_id: "hw-1",
    child_id: "child-1",
    completed_at: "2026-04-14T10:00:00",
    submitted_at: "2026-04-14T10:00:00",
    points_earned: 1,
    awarded_points: 1,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-04-14T10:00:00",
  },
  {
    id: "ci-prev-1",
    homework_id: "hw-2",
    child_id: "child-1",
    completed_at: "2026-04-08T10:00:00",
    submitted_at: "2026-04-08T10:00:00",
    points_earned: 8,
    awarded_points: 8,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-04-08T10:00:00",
  },
];

const supabaseClient = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: "child-1" },
        },
      },
    }),
  },
  from: vi.fn((table: string) => {
    if (table === "homeworks") {
      return {
        select: () => ({
          eq: vi.fn(() => Promise.resolve({ data: homeworkRows })),
        }),
      };
    }

    if (table === "check_ins") {
      const query = {
        eq: vi.fn(() => query),
        order: vi.fn().mockResolvedValue({ data: checkInRows }),
      };

      return {
        select: () => query,
      };
    }

    return {
      select: () => ({
        eq: vi.fn(),
      }),
    };
  }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => supabaseClient),
}));

describe("Child landing page", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves the week summary backward when selecting the previous week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    await act(async () => {
      render(<ChildLandingPage />);
      await vi.runAllTimersAsync();
    });

    expect(createClient).toHaveBeenCalledTimes(1);

    const completedDaysCard = screen.getByText("完成天数").parentElement;
    expect(completedDaysCard).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "上一周" }));
    });

    expect(within(completedDaysCard as HTMLElement).getByText("1")).toBeInTheDocument();
  });
});
