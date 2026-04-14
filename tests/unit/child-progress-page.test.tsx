import { createElement } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProgressPage from "@/app/(child)/progress/page";
import { createClient } from "@/lib/supabase/client";

const mockedCreateClient = vi.hoisted(() => vi.fn());

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const aprilHomeworks = [
  {
    id: "hw-april-1",
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
    id: "hw-april-2",
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
    point_value: 4,
    estimated_minutes: 20,
    daily_cutoff_time: "20:00",
    is_active: false,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-04-01T00:00:00.000Z",
  },
];

const marchHomeworks = [
  {
    id: "hw-march-1",
    child_id: "child-1",
    type_id: null,
    type_name: "英语",
    type_icon: "🔤",
    title: "英语单词",
    description: null,
    repeat_type: "daily",
    repeat_days: null,
    repeat_interval: null,
    repeat_start_date: null,
    repeat_end_date: null,
    point_value: 6,
    estimated_minutes: 12,
    daily_cutoff_time: "20:00",
    is_active: true,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "hw-march-2",
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
    point_value: 4,
    estimated_minutes: 20,
    daily_cutoff_time: "20:00",
    is_active: false,
    required_checkpoint_type: null,
    created_by: "parent-1",
    created_at: "2026-03-01T00:00:00.000Z",
  },
];

const aprilCheckIns = [
  {
    id: "ci-april-1",
    homework_id: "hw-april-1",
    child_id: "child-1",
    completed_at: "2026-04-02T16:00:00",
    submitted_at: "2026-04-02T16:00:00",
    points_earned: 3,
    awarded_points: 3,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-04-02T16:00:00",
  },
  {
    id: "ci-april-2",
    homework_id: "hw-april-2",
    child_id: "child-1",
    completed_at: "2026-04-03T18:10:00",
    submitted_at: "2026-04-03T18:10:00",
    points_earned: 4,
    awarded_points: 4,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-04-03T18:10:00",
  },
];

const marchCheckIns = [
  {
    id: "ci-march-1",
    homework_id: "hw-march-1",
    child_id: "child-1",
    completed_at: "2026-03-12T17:00:00",
    submitted_at: "2026-03-12T17:00:00",
    points_earned: 6,
    awarded_points: 6,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-03-12T17:00:00",
  },
  {
    id: "ci-march-2",
    homework_id: "hw-march-2",
    child_id: "child-1",
    completed_at: "2026-03-12T18:00:00",
    submitted_at: "2026-03-12T18:00:00",
    points_earned: 4,
    awarded_points: 4,
    is_scored: true,
    is_late: false,
    proof_type: null,
    note: null,
    created_at: "2026-03-12T18:00:00",
  },
];

type RequestState = {
  homeworks: Deferred<{ data: typeof aprilHomeworks | typeof marchHomeworks }>;
  checkIns: Deferred<{ data: typeof aprilCheckIns | typeof marchCheckIns }>;
};

const requests: RequestState[] = [];
let sessionRequestCount = 0;

function ensureRequest(index: number) {
  if (!requests[index]) {
    requests[index] = {
      homeworks: createDeferred(),
      checkIns: createDeferred(),
    };
  }

  return requests[index];
}

function resolveRequest(
  index: number,
  payload: {
    homeworks: typeof aprilHomeworks | typeof marchHomeworks;
    checkIns: typeof aprilCheckIns | typeof marchCheckIns;
  }
) {
  const request = ensureRequest(index);
  request.homeworks.resolve({ data: payload.homeworks });
  request.checkIns.resolve({ data: payload.checkIns });
}

const supabaseClient = {
  auth: {
    getSession: vi.fn().mockImplementation(async () => {
      ensureRequest(sessionRequestCount);
      sessionRequestCount += 1;

      return {
        data: {
          session: {
            user: { id: "child-1" },
          },
        },
      };
    }),
  },
  from: vi.fn((table: string) => {
    const currentRequest = ensureRequest(Math.max(sessionRequestCount - 1, 0));

    if (table === "homeworks") {
      return {
        select: () => ({
          eq: vi.fn(() => currentRequest.homeworks.promise),
        }),
      };
    }

    if (table === "check_ins") {
      const query = {
        eq: vi.fn(() => query),
        gte: vi.fn(() => query),
        lte: vi.fn(() => query),
        order: vi.fn(() => currentRequest.checkIns.promise),
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

mockedCreateClient.mockImplementation(() => supabaseClient);

vi.mock("@/lib/supabase/client", () => ({
  createClient: mockedCreateClient,
}));

describe("Child progress page", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    requests.length = 0;
    sessionRequestCount = 0;
  });

  it("renders historical month data without losing inactive homework rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    render(<ProgressPage />);

    await act(async () => {
      resolveRequest(0, {
        homeworks: aprilHomeworks,
        checkIns: aprilCheckIns,
      });
      await Promise.resolve();
    });

    await act(async () => {
      screen.getByRole("button", { name: "上个月" }).click();
      await Promise.resolve();
    });

    await act(async () => {
      resolveRequest(1, {
        homeworks: marchHomeworks,
        checkIns: marchCheckIns,
      });
      await Promise.resolve();
    });

    expect(screen.getByText("月度打卡分析")).toBeInTheDocument();
    expect(screen.getByText("2026年3月")).toBeInTheDocument();
    expect(screen.getByLabelText("2026-03-12 完成 2/2")).toBeInTheDocument();
    expect(screen.getByText("打卡高峰时段")).toBeInTheDocument();
    expect(screen.getByText("高峰")).toBeInTheDocument();
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest month visible when responses arrive out of order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    render(<ProgressPage />);

    await act(async () => {
      resolveRequest(0, {
        homeworks: aprilHomeworks,
        checkIns: aprilCheckIns,
      });
      await Promise.resolve();
    });

    await act(async () => {
      screen.getByRole("button", { name: "上个月" }).click();
      await Promise.resolve();
    });

    await act(async () => {
      resolveRequest(1, {
        homeworks: marchHomeworks,
        checkIns: marchCheckIns,
      });
      await Promise.resolve();
    });

    expect(screen.getByText("2026年3月")).toBeInTheDocument();
    expect(screen.getByLabelText("2026-03-12 完成 2/2")).toBeInTheDocument();

    await act(async () => {
      resolveRequest(0, {
        homeworks: aprilHomeworks,
        checkIns: aprilCheckIns,
      });
      await Promise.resolve();
    });

    expect(screen.getByText("2026年3月")).toBeInTheDocument();
    expect(screen.getByLabelText("2026-03-12 完成 2/2")).toBeInTheDocument();
    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
  });

  it("shows an error state when loading fails", async () => {
    const failingClient = {
      ...supabaseClient,
      from: vi.fn((table: string) => {
        if (table === "homeworks") {
          return {
            select: () => ({
              eq: vi.fn(() => Promise.reject(new Error("boom"))),
            }),
          };
        }

        return supabaseClient.from(table);
      }),
    };

    mockedCreateClient.mockReturnValueOnce(failingClient);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    render(<ProgressPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("加载月度数据失败")).toBeInTheDocument();
  });
});
