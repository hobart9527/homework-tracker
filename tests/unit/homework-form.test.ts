import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildAssignmentSummary,
  buildHomeworkDraftFromSource,
  buildHomeworkInsertRows,
  buildHomeworkRulePreview,
  type HomeworkFormState,
} from "@/lib/homework-form";
import NewHomeworkPage from "@/app/(parent)/homework/new/page";
import { HomeworkForm } from "@/components/parent/HomeworkForm";
import { HomeworkCard } from "@/components/parent/HomeworkCard";

const push = vi.fn();
const back = vi.fn();
const insert = vi.fn().mockResolvedValue({ error: null });
const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
const selectSourceHomework = vi.fn(() =>
  Promise.resolve({
    data: {
      id: "hw-copy",
      child_id: "child-2",
      type_id: null,
      type_name: "钢琴",
      type_icon: "🎹",
      title: "钢琴加练",
      description: "每天 30 分钟",
      repeat_type: "weekly",
      repeat_days: [1, 3, 5],
      repeat_interval: null,
      repeat_start_date: "2026-04-01",
      repeat_end_date: null,
      point_value: 6,
      estimated_minutes: 30,
      daily_cutoff_time: "19:30",
      is_active: true,
      required_checkpoint_type: "photo",
      created_by: "parent-1",
      created_at: "2026-04-11T08:00:00.000Z",
    },
    error: null,
  })
);
const selectChildren = vi.fn(() =>
  Promise.resolve({
    data: [
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
    ],
  })
);
const selectCustomTypes = vi.fn(() => Promise.resolve({ data: [] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    back,
  }),
}));

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

    if (table === "custom_homework_types") {
      return {
        select: () => ({
          eq: selectCustomTypes,
        }),
      };
    }

    if (table === "homeworks") {
      return {
        insert,
        update,
        select: () => ({
          eq: () => ({
            maybeSingle: selectSourceHomework,
          }),
        }),
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
  createClient: () => supabaseClient,
}));

function makeForm(
  overrides: Partial<HomeworkFormState> = {}
): HomeworkFormState {
  return {
    child_ids: ["child-1"],
    type_id: "",
    type_name: "阅读",
    type_icon: "📖",
    title: "阅读练习",
    description: "",
    repeat_type: "daily",
    repeat_days: [],
    repeat_interval: 1,
    repeat_start_date: "",
    point_value: 3,
    estimated_minutes: 20,
    daily_cutoff_time: "20:00",
    required_checkpoint_type: "",
    ...overrides,
  };
}

describe("buildHomeworkInsertRows", () => {
  it("creates one insert row per selected child", () => {
    const rows = buildHomeworkInsertRows(
      makeForm({
        child_ids: ["child-1", "child-2"],
        required_checkpoint_type: "photo",
      }),
      "parent-1"
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.child_id)).toEqual(["child-1", "child-2"]);
    expect(rows[0].required_checkpoint_type).toBe("photo");
  });

  it("keeps weekly and interval fields aligned to repeat type", () => {
    const weeklyRow = buildHomeworkInsertRows(
      makeForm({
        repeat_type: "weekly",
        repeat_days: [1, 3, 5],
        repeat_interval: 4,
      }),
      "parent-1"
    )[0];

    const intervalRow = buildHomeworkInsertRows(
      makeForm({
        repeat_type: "interval",
        repeat_days: [2],
        repeat_interval: 3,
      }),
      "parent-1"
    )[0];

    expect(weeklyRow.repeat_days).toEqual([1, 3, 5]);
    expect(weeklyRow.repeat_interval).toBeNull();
    expect(intervalRow.repeat_days).toBeNull();
    expect(intervalRow.repeat_interval).toBe(3);
  });
});

describe("buildAssignmentSummary", () => {
  it("describes batch assignment as independent copies", () => {
    const summary = buildAssignmentSummary([
      { id: "child-1", name: "Ivy" },
      { id: "child-2", name: "Albert" },
    ]);

    expect(summary.selectedCount).toBe(2);
    expect(summary.createCountLabel).toBe("将创建 2 份独立作业");
    expect(summary.independenceHint).toContain("后续每个孩子可以单独修改");
  });
});

describe("buildHomeworkRulePreview", () => {
  it("explains the photo proof flow and late policy", () => {
    const preview = buildHomeworkRulePreview(
      makeForm({
        child_ids: ["child-1", "child-2"],
        repeat_type: "weekly",
        repeat_days: [1, 3, 5],
        required_checkpoint_type: "photo",
      }),
      ["Ivy", "Albert"]
    );

    expect(preview.childLabel).toContain("Ivy、Albert");
    expect(preview.proofLabel).toContain("照片证明");
    expect(preview.proofLabel).toContain("拍照或上传已有图片");
    expect(preview.cutoffLabel).toContain("逾期后仍可补交并获得积分");
    expect(preview.scheduleLabel).toContain("每周");
  });
});

describe("buildHomeworkDraftFromSource", () => {
  it("turns a source homework into a new-form draft", () => {
    const draft = buildHomeworkDraftFromSource({
      child_id: "child-2",
      type_id: null,
      type_name: "钢琴",
      type_icon: "🎹",
      title: "钢琴加练",
      description: "每天 30 分钟",
      repeat_type: "weekly",
      repeat_days: [1, 3, 5],
      repeat_interval: null,
      repeat_start_date: "2026-04-01",
      point_value: 6,
      estimated_minutes: 30,
      daily_cutoff_time: "19:30",
      required_checkpoint_type: "photo",
    } as any);

    expect(draft.child_ids).toEqual(["child-2"]);
    expect(draft.title).toBe("钢琴加练");
    expect(draft.repeat_days).toEqual([1, 3, 5]);
    expect(draft.required_checkpoint_type).toBe("photo");
  });
});

describe("HomeworkForm workbench", () => {
  it("allows selecting multiple children when creating homework", async () => {
    render(createElement(HomeworkForm));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /🦊 Ivy/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /🐼 Albert/ }));

    expect(screen.getByText("将创建 2 份独立作业")).toBeInTheDocument();
  });

  it("leads with title, assignment, and rules instead of a large type grid", async () => {
    render(createElement(HomeworkForm));

    await waitFor(() => {
      expect(screen.getByLabelText("作业标题")).toBeInTheDocument();
    });

    expect(screen.getByText("重复规则")).toBeInTheDocument();
    expect(screen.getByText("快捷类型（可选）")).toBeInTheDocument();
    expect(screen.queryByText("作业类型")).not.toBeInTheDocument();
    expect(screen.queryByText("自定义")).not.toBeInTheDocument();
  });

  it("keeps a lightweight type aid that can autofill the title", async () => {
    render(createElement(HomeworkForm));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "快捷类型（可选）" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox", { name: "快捷类型（可选）" }), {
      target: { value: "钢琴" },
    });

    expect(screen.getByDisplayValue("钢琴练习")).toBeInTheDocument();
  });

  it("shows the photo proof explanation in the preview", async () => {
    render(createElement(HomeworkForm));

    await waitFor(() => {
      expect(screen.getByText("照片")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("照片"));

    expect(
      screen.getByText(/可以拍照或上传已有图片/)
    ).toBeInTheDocument();
  });

  it("prefills the form from a copied homework source", async () => {
    render(createElement(HomeworkForm, { copyFromHomeworkId: "hw-copy" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("钢琴加练")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("每天 30 分钟")).toBeInTheDocument();
    expect(screen.getByText("将创建 1 份独立作业")).toBeInTheDocument();
    expect(screen.getByText(/会分别分配给 Albert/)).toBeInTheDocument();
  });
});

describe("Homework management page framing", () => {
  it("tells parents that batch create makes independent homework copies", () => {
    render(createElement(NewHomeworkPage));

    expect(
      screen.getByText(/可以一次分配给多个孩子，系统会分别创建独立作业/)
    ).toBeInTheDocument();
  });

  it("shows photo proof and cutoff hints in homework cards", () => {
    render(
      createElement(HomeworkCard, {
        homework: {
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
          created_at: null,
        },
        proofType: "photo",
        statusText: "待完成",
        awardedPoints: 0,
        scored: false,
      })
    );

    expect(screen.getByText("需要照片")).toBeInTheDocument();
    expect(screen.getByText(/截止 20:00/)).toBeInTheDocument();
  });
});
