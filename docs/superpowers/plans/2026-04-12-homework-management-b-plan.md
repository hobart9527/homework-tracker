# Homework Management B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild homework creation/editing into a two-column workbench that supports assigning one homework to multiple children as independent copies, while simplifying proof requirements to `无要求 / 照片 / 录音` and making rule behavior obvious to parents.

**Architecture:** Keep the existing parent homework routes, but split the oversized form into a left-side assignment workspace and a right-side rule workspace with inline explanations. Normalize proof semantics around `photo` and `audio` at the data layer, treat batch assignment as a create-time fan-out operation that inserts one homework row per selected child, and preserve single-homework editing after creation.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase, Vitest

---

## File Map

- Modify: `src/components/parent/HomeworkForm.tsx`
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/app/(parent)/homework/[id]/page.tsx`
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/components/child/ChildHomeworkCard.tsx`
- Modify: `src/components/child/CheckInModal.tsx`
- Modify: `src/components/parent/HomeworkCard.tsx`
- Modify: `src/lib/tasks/daily-task.ts`
- Modify: `src/lib/tasks/check-in-submission.ts`
- Modify: `src/lib/parent-dashboard.ts`
- Modify: `src/lib/supabase/types.ts`
- Modify: `tests/unit/homework-data.test.ts`
- Modify: `tests/unit/checkpoint.test.ts`
- Modify: `tests/unit/check-in-submission.test.ts`
- Modify: `tests/unit/daily-task.test.ts`
- Modify: `tests/unit/parent-dashboard.test.ts`
- Create: `src/lib/homework-form.ts`
- Create: `src/components/parent/HomeworkAssignmentPanel.tsx`
- Create: `src/components/parent/HomeworkRulePreview.tsx`
- Create: `tests/unit/homework-form.test.ts`
- Create: `supabase/migrations/008_unify_photo_proof_type.sql`

## Shared Shapes

Keep names consistent across tasks:

```ts
export type HomeworkProofType = "photo" | "audio" | null;

export type HomeworkFormState = {
  child_ids: string[];
  type_id: string;
  type_name: string;
  type_icon: string;
  title: string;
  description: string;
  repeat_type: "daily" | "weekly" | "interval" | "once";
  repeat_days: number[];
  repeat_interval: number;
  repeat_start_date: string;
  point_value: number;
  estimated_minutes: number;
  daily_cutoff_time: string;
  required_checkpoint_type: HomeworkProofType | "";
};

export type HomeworkAssignmentSummary = {
  selectedCount: number;
  childNames: string[];
  createCountLabel: string;
  independenceHint: string;
};

export type HomeworkRulePreview = {
  title: string;
  childLabel: string;
  scheduleLabel: string;
  proofLabel: string;
  cutoffLabel: string;
  scoringLabel: string;
};
```

### Task 1: Unify Proof Semantics Around `photo`

**Files:**
- Create: `supabase/migrations/008_unify_photo_proof_type.sql`
- Modify: `src/lib/tasks/daily-task.ts`
- Modify: `src/lib/tasks/check-in-submission.ts`
- Modify: `src/lib/supabase/types.ts`
- Modify: `src/components/child/ChildHomeworkCard.tsx`
- Modify: `src/components/child/CheckInModal.tsx`
- Modify: `src/components/parent/HomeworkCard.tsx`
- Modify: `src/lib/parent-dashboard.ts`
- Test: `tests/unit/checkpoint.test.ts`
- Test: `tests/unit/check-in-submission.test.ts`
- Test: `tests/unit/daily-task.test.ts`
- Test: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing proof-type tests**

```ts
it("treats photo as the only image proof type", () => {
  expect(isProofType("photo")).toBe(true);
  expect(isProofType("audio")).toBe(true);
  expect(isProofType("screenshot")).toBe(false);
});

it("renders photo requirements with the new label", () => {
  expect(getProofLabel("photo")).toBe("照片");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts`

Expected: FAIL because `screenshot` is still accepted and display labels still mention `截图`.

- [ ] **Step 3: Add the migration that collapses screenshot into photo**

```sql
-- supabase/migrations/008_unify_photo_proof_type.sql
UPDATE checkpoints
SET type = 'photo'
WHERE type = 'screenshot';

UPDATE homeworks
SET required_checkpoint_type = 'photo'
WHERE required_checkpoint_type = 'screenshot';

UPDATE check_ins
SET proof_type = 'photo'
WHERE proof_type = 'screenshot';

ALTER TABLE checkpoints DROP CONSTRAINT IF EXISTS checkpoints_type_check;
ALTER TABLE checkpoints
  ADD CONSTRAINT checkpoints_type_check
  CHECK (type IN ('photo', 'audio'));

ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_proof_type_check;
ALTER TABLE check_ins
  ADD CONSTRAINT check_ins_proof_type_check
  CHECK (proof_type IN ('photo', 'audio') OR proof_type IS NULL);
```

- [ ] **Step 4: Update shared types and proof-label helpers**

```ts
// src/lib/tasks/daily-task.ts
export type ProofType = "photo" | "audio" | null;

// src/lib/tasks/check-in-submission.ts
const PROOF_TYPES: Exclude<ProofType, null>[] = ["photo", "audio"];

export function getProofLabel(proofType: ProofType) {
  if (proofType === "photo") return "照片";
  if (proofType === "audio") return "录音";
  return "无要求";
}
```

- [ ] **Step 5: Update UI copy to reflect `照片` semantics**

```tsx
// src/components/child/CheckInModal.tsx
const proofDescription =
  homework.required_checkpoint_type === "photo"
    ? "需要提交照片证明，可以拍照或上传已有图片"
    : homework.required_checkpoint_type === "audio"
      ? "需要提交录音证明"
      : null;
```

- [ ] **Step 6: Run the proof-related tests**

Run: `npm test -- --run tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts tests/unit/daily-task.test.ts tests/unit/parent-dashboard.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/008_unify_photo_proof_type.sql src/lib/tasks/daily-task.ts src/lib/tasks/check-in-submission.ts src/lib/supabase/types.ts src/components/child/ChildHomeworkCard.tsx src/components/child/CheckInModal.tsx src/components/parent/HomeworkCard.tsx src/lib/parent-dashboard.ts tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts tests/unit/daily-task.test.ts tests/unit/parent-dashboard.test.ts
git commit -m "refactor: unify homework proof types"
```

### Task 2: Add Batch-Assignment Builders For Homework Creation

**Files:**
- Create: `src/lib/homework-form.ts`
- Modify: `tests/unit/homework-data.test.ts`
- Create: `tests/unit/homework-form.test.ts`

- [ ] **Step 1: Write the failing batch-builder tests**

```ts
import { buildHomeworkInsertRows, buildAssignmentSummary } from "@/lib/homework-form";

it("creates one insert row per selected child", () => {
  const rows = buildHomeworkInsertRows({
    child_ids: ["c1", "c2"],
    title: "阅读练习",
    required_checkpoint_type: "photo",
  }, "parent-1");

  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.child_id)).toEqual(["c1", "c2"]);
});

it("describes batch assignment as independent copies", () => {
  const summary = buildAssignmentSummary([
    { id: "c1", name: "Ivy" },
    { id: "c2", name: "Albert" },
  ]);

  expect(summary.createCountLabel).toBe("将创建 2 份独立作业");
  expect(summary.independenceHint).toContain("后续每个孩子可以单独修改");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts`

Expected: FAIL with missing module/function.

- [ ] **Step 3: Implement the builder helpers**

```ts
// src/lib/homework-form.ts
export function buildHomeworkInsertRows(form: HomeworkFormState, createdBy: string) {
  return form.child_ids.map((childId) => ({
    child_id: childId,
    type_id: form.type_id || null,
    type_name: form.type_name,
    type_icon: form.type_icon,
    title: form.title,
    description: form.description || null,
    required_checkpoint_type: form.required_checkpoint_type || null,
    repeat_type: form.repeat_type,
    repeat_days: form.repeat_type === "weekly" ? form.repeat_days : null,
    repeat_interval: form.repeat_type === "interval" ? form.repeat_interval : null,
    repeat_start_date: form.repeat_start_date || null,
    point_value: form.point_value,
    estimated_minutes: form.estimated_minutes,
    daily_cutoff_time: form.daily_cutoff_time || null,
    created_by: createdBy,
  }));
}

export function buildAssignmentSummary(children: Array<{ id: string; name: string }>): HomeworkAssignmentSummary {
  return {
    selectedCount: children.length,
    childNames: children.map((child) => child.name),
    createCountLabel: `将创建 ${children.length} 份独立作业`,
    independenceHint: "创建后这些作业彼此独立，后续每个孩子可以单独修改。",
  };
}
```

- [ ] **Step 4: Add rule-preview label helpers in the same module**

```ts
export function buildHomeworkRulePreview(form: HomeworkFormState, childNames: string[]): HomeworkRulePreview {
  return {
    title: form.title || `${form.type_name || "新作业"}`,
    childLabel: childNames.length ? `会分别分配给 ${childNames.join("、")}` : "请先选择孩子",
    scheduleLabel: getScheduleLabel(form),
    proofLabel: form.required_checkpoint_type === "photo"
      ? "孩子完成时需要提交照片证明，可以拍照或上传已有图片"
      : form.required_checkpoint_type === "audio"
        ? "孩子完成时需要提交录音证明"
        : "孩子完成时不需要额外证明",
    cutoffLabel: form.daily_cutoff_time
      ? `建议在 ${form.daily_cutoff_time} 前完成，逾期后仍可补交并获得积分`
      : "未设置截止时间",
    scoringLabel: "同一天允许重复提交，但只有第一次完成会计分。",
  };
}
```

- [ ] **Step 5: Run the builder tests**

Run: `npm test -- --run tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/homework-form.ts tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts
git commit -m "feat: add homework batch assignment builders"
```

### Task 3: Rebuild HomeworkForm As A Two-Column Workbench

**Files:**
- Modify: `src/components/parent/HomeworkForm.tsx`
- Create: `src/components/parent/HomeworkAssignmentPanel.tsx`
- Create: `src/components/parent/HomeworkRulePreview.tsx`
- Test: `tests/unit/homework-form.test.ts`

- [ ] **Step 1: Write the failing form-workbench tests**

```ts
it("allows selecting multiple children when creating homework", async () => {
  render(<HomeworkForm />);
  await user.click(screen.getByRole("button", { name: /Ivy/ }));
  await user.click(screen.getByRole("button", { name: /Albert/ }));
  expect(screen.getByText("将创建 2 份独立作业")).toBeInTheDocument();
});

it("shows the photo proof explanation in the preview", async () => {
  render(<HomeworkForm />);
  await user.click(screen.getByRole("button", { name: /照片/ }));
  expect(screen.getByText(/可以拍照或上传已有图片/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/homework-form.test.ts`

Expected: FAIL because the form is still single-child and has no preview panel.

- [ ] **Step 3: Add the left-side assignment panel**

```tsx
// src/components/parent/HomeworkAssignmentPanel.tsx
export function HomeworkAssignmentPanel({ children, selectedIds, onToggle }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-forest-700">分配给谁</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((child) => (
          <button key={child.id} type="button" onClick={() => onToggle(child.id)}>
            <span>{child.avatar} {child.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Refactor HomeworkForm to use `child_ids` and batch inserts**

```tsx
// inside HomeworkForm
const isEditing = !!homework;
const selectedChildren = children.filter((child) => formData.child_ids.includes(child.id));
const assignmentSummary = buildAssignmentSummary(selectedChildren);
const preview = buildHomeworkRulePreview(formData, assignmentSummary.childNames);

const rows = buildHomeworkInsertRows(formData, session.user.id);
if (homework) {
  await supabase.from("homeworks").update(rows[0]).eq("id", homework.id);
} else {
  await supabase.from("homeworks").insert(rows);
}
```

- [ ] **Step 5: Add the right-side rule preview and inline guidance**

```tsx
// src/components/parent/HomeworkRulePreview.tsx
export function HomeworkRulePreview({ preview }: { preview: HomeworkRulePreview }) {
  return (
    <aside className="rounded-3xl bg-sand-50 p-4">
      <h3 className="font-semibold text-forest-700">孩子端会这样显示</h3>
      <ul className="mt-3 space-y-2 text-sm text-forest-600">
        <li>{preview.childLabel}</li>
        <li>{preview.scheduleLabel}</li>
        <li>{preview.proofLabel}</li>
        <li>{preview.cutoffLabel}</li>
        <li>{preview.scoringLabel}</li>
      </ul>
    </aside>
  );
}
```

- [ ] **Step 6: Make editing stay single-homework and disable multi-select fan-out there**

```tsx
const canBatchAssign = !isEditing;
const selectedIds = isEditing ? [homework.child_id] : formData.child_ids;
```

- [ ] **Step 7: Run form tests**

Run: `npm test -- --run tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/parent/HomeworkForm.tsx src/components/parent/HomeworkAssignmentPanel.tsx src/components/parent/HomeworkRulePreview.tsx tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts
git commit -m "feat: redesign homework form as batch workbench"
```

### Task 4: Reframe Homework Pages Around The New Workflow

**Files:**
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/app/(parent)/homework/[id]/page.tsx`
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/components/parent/HomeworkCard.tsx`
- Test: `tests/unit/homework-form.test.ts`

- [ ] **Step 1: Write the failing page-flow tests**

```ts
it("tells parents that batch create produces independent homework copies", () => {
  render(<NewHomeworkPage />);
  expect(screen.getByText(/会分别创建独立作业/)).toBeInTheDocument();
});

it("shows photo proof and cutoff hints in the homework list", () => {
  render(<HomeworkCard title="阅读练习" proofType="photo" cutoffTime="20:00" />);
  expect(screen.getByText(/需要照片证明/)).toBeInTheDocument();
  expect(screen.getByText(/20:00/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/homework-form.test.ts`

Expected: FAIL because the pages still describe the old single-child flow.

- [ ] **Step 3: Update the new/edit page shells**

```tsx
// src/app/(parent)/homework/new/page.tsx
<header className="bg-primary text-white p-4">
  <div className="mx-auto max-w-6xl">
    <h1 className="text-xl font-bold">新建作业</h1>
    <p className="mt-1 text-sm text-white/80">可以一次分配给多个孩子，系统会分别创建独立作业。</p>
  </div>
</header>
```

- [ ] **Step 4: Update the homework list cards to reinforce rule understanding**

```tsx
// src/components/parent/HomeworkCard.tsx
const proofHint = proofType === "photo"
  ? "需要照片证明"
  : proofType === "audio"
    ? "需要录音证明"
    : "无额外证明";

const cutoffHint = cutoffTime
  ? `建议 ${cutoffTime} 前完成，逾期后仍可补交并获得积分`
  : "未设置截止时间";
```

- [ ] **Step 5: Run the page-flow tests**

Run: `npm test -- --run tests/unit/homework-form.test.ts tests/unit/checkpoint.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/(parent)/homework/new/page.tsx src/app/(parent)/homework/[id]/page.tsx src/app/(parent)/homework/page.tsx src/components/parent/HomeworkCard.tsx tests/unit/homework-form.test.ts tests/unit/checkpoint.test.ts
git commit -m "feat: align homework pages with batch workflow"
```

### Task 5: Run End-To-End Verification For The Homework Workbench

**Files:**
- Modify: `tests/unit/homework-form.test.ts`
- Modify: `tests/unit/checkpoint.test.ts`
- Modify: `tests/unit/check-in-submission.test.ts`
- Modify: `tests/unit/homework-data.test.ts`

- [ ] **Step 1: Add the regression cases that cover the new contract**

```ts
it("stores photo as the normalized image proof type", () => {
  const rows = buildHomeworkInsertRows({ ...form, required_checkpoint_type: "photo", child_ids: ["c1"] }, "parent-1");
  expect(rows[0].required_checkpoint_type).toBe("photo");
});

it("creates two independent rows when two children are selected", () => {
  const rows = buildHomeworkInsertRows({ ...form, child_ids: ["c1", "c2"] }, "parent-1");
  expect(new Set(rows.map((row) => row.child_id)).size).toBe(2);
});
```

- [ ] **Step 2: Run the focused regression suite**

Run: `npm test -- --run tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts`

Expected: PASS

- [ ] **Step 3: Run the full suite**

Run: `npm test -- --run`

Expected: PASS for the full repository test suite.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: PASS with no new route or type errors.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/homework-form.test.ts tests/unit/homework-data.test.ts tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts
git commit -m "test: verify homework management workbench"
```

## Self-Review

- Spec coverage: The plan covers batch assignment as independent copies, proof-type simplification to `照片/录音`, a two-column workbench form, inline child-side rule explanations, and list/page wording updates so the new rules stay visible after creation.
- Placeholder scan: No `TODO`, `TBD`, or “implement later” placeholders remain. Every task has explicit files, concrete code shapes, and exact verification commands.
- Type consistency: The plan consistently uses `HomeworkProofType = "photo" | "audio" | null`, `child_ids` for create-time multi-select, and keeps editing single-row by restricting fan-out to create mode.

Plan complete and saved to `docs/superpowers/plans/2026-04-12-homework-management-b-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
