# Parent Dashboard A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the parent dashboard around a child-summary-first home page, with all-child overview cards on top and a selected child’s mixed summary/task detail below.

**Architecture:** Reuse the daily task/status logic already added for the child flow, then reshape the parent dashboard into two layers: a sortable summary-card strip for all children and a focused detail workspace for the selected child. Keep existing parent navigation and reuse current parent components where possible by splitting oversized responsibilities instead of rewriting everything.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase, Vitest

---

## File Map

- Modify: `src/app/(parent)/dashboard/page.tsx`
- Modify: `src/components/parent/ChildSelector.tsx`
- Modify: `src/components/parent/TodayOverview.tsx`
- Modify: `src/components/parent/HomeworkCard.tsx`
- Create: `src/lib/parent-dashboard.ts`
- Create: `src/components/parent/ChildSummaryCard.tsx`
- Create: `src/components/parent/ParentChildSummaryPanel.tsx`
- Create: `src/components/parent/ParentChildTaskList.tsx`
- Create: `tests/unit/parent-dashboard.test.ts`
- Modify: `tests/unit/homework-data.test.ts`

## Shared Shapes

Keep names consistent across tasks:

```ts
export type ParentChildDashboardSummary = {
  childId: string;
  childName: string;
  avatar: string | null;
  completedCount: number;
  totalCount: number;
  todayPoints: number;
  overdueCount: number;
  makeupCount: number;
  outstandingCount: number;
  topNotice: string;
};

export type ParentChildDashboardDetail = {
  summary: ParentChildDashboardSummary;
  tasks: Array<{
    homeworkId: string;
    title: string;
    typeIcon: string | null;
    cutoffTime: string | null;
    proofType: "photo" | "screenshot" | "audio" | null;
    statusText: string;
    scored: boolean;
    awardedPoints: number;
  }>;
};
```

### Task 1: Add Parent Dashboard Data Builder

**Files:**
- Create: `src/lib/parent-dashboard.ts`
- Create: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing summary-builder tests**

```ts
import { describe, expect, it } from "vitest";
import { buildParentDashboard } from "@/lib/parent-dashboard";

describe("buildParentDashboard", () => {
  it("builds a top-level summary for each child", () => {
    const result = buildParentDashboard(/* fixture */);
    expect(result.summaries).toHaveLength(2);
    expect(result.summaries[0].completedCount).toBe(3);
  });

  it("marks overdue children ahead of fully completed children", () => {
    const result = buildParentDashboard(/* fixture */);
    expect(result.summaries[0].overdueCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: FAIL with missing module/function.

- [ ] **Step 3: Implement the parent dashboard builder**

```ts
// src/lib/parent-dashboard.ts
export function buildParentDashboard(input: {
  children: Child[];
  homeworks: Homework[];
  checkIns: CheckIn[];
  date: string;
}) {
  // group homeworks/check-ins per child
  // reuse buildDailyTaskStatuses for each child
  // compute summary + detail shapes
  // sort children by overdueCount, outstandingCount, then name
}
```

- [ ] **Step 4: Add a default selected-child helper**

```ts
export function getDefaultSelectedChildId(summaries: ParentChildDashboardSummary[]) {
  return summaries[0]?.childId ?? null;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/parent-dashboard.ts tests/unit/parent-dashboard.test.ts
git commit -m "feat: add parent dashboard summary builder"
```

### Task 2: Upgrade ChildSelector Into Summary Cards

**Files:**
- Modify: `src/components/parent/ChildSelector.tsx`
- Create: `src/components/parent/ChildSummaryCard.tsx`
- Test: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing selector-card tests**

```ts
it("renders one summary card per child", () => {
  render(<ChildSelector summaries={fixture} selectedId="c1" onSelect={() => {}} />);
  expect(screen.getByText("Ivy")).toBeInTheDocument();
  expect(screen.getByText("今日 +8 分")).toBeInTheDocument();
});

it("shows the top notice for each child", () => {
  render(<ChildSelector summaries={fixture} selectedId="c1" onSelect={() => {}} />);
  expect(screen.getByText("还有 2 项未完成")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: FAIL until the selector is refactored to summary cards.

- [ ] **Step 3: Add the summary-card component**

```tsx
// src/components/parent/ChildSummaryCard.tsx
export function ChildSummaryCard({ summary, selected, onSelect }: Props) {
  return (
    <button onClick={() => onSelect(summary.childId)} className={selected ? "..." : "..."}>
      <div>{summary.avatar || "🦊"} {summary.childName}</div>
      <div>{summary.completedCount}/{summary.totalCount}</div>
      <div>今日 +{summary.todayPoints} 分</div>
      <div>{summary.topNotice}</div>
    </button>
  );
}
```

- [ ] **Step 4: Refactor ChildSelector to render summary cards**

```tsx
// src/components/parent/ChildSelector.tsx
export function ChildSelector({ summaries, selectedId, onSelect }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {summaries.map((summary) => (
        <ChildSummaryCard
          key={summary.childId}
          summary={summary}
          selected={summary.childId === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/parent/ChildSelector.tsx src/components/parent/ChildSummaryCard.tsx tests/unit/parent-dashboard.test.ts
git commit -m "feat: turn child selector into summary cards"
```

### Task 3: Split TodayOverview Into Mixed Detail Panels

**Files:**
- Modify: `src/components/parent/TodayOverview.tsx`
- Create: `src/components/parent/ParentChildSummaryPanel.tsx`
- Create: `src/components/parent/ParentChildTaskList.tsx`
- Modify: `src/components/parent/HomeworkCard.tsx`
- Test: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing detail-panel tests**

```ts
it("shows summary metrics above the task list", () => {
  render(<TodayOverview detail={fixture} />);
  expect(screen.getByText("今日完成率")).toBeInTheDocument();
  expect(screen.getByText("今日任务")).toBeInTheDocument();
});

it("shows proof requirement and task status per row", () => {
  render(<TodayOverview detail={fixture} />);
  expect(screen.getByText("需要截图")).toBeInTheDocument();
  expect(screen.getByText("逾期完成")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: FAIL until the overview is split into mixed detail panels.

- [ ] **Step 3: Create the summary panel**

```tsx
// src/components/parent/ParentChildSummaryPanel.tsx
export function ParentChildSummaryPanel({ summary }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="今日完成率" value={`${summary.completedCount}/${summary.totalCount}`} />
      <MetricCard label="今日积分" value={summary.todayPoints} />
      <MetricCard label="待完成" value={summary.outstandingCount} />
      <MetricCard label="逾期" value={summary.overdueCount} />
    </div>
  );
}
```

- [ ] **Step 4: Create the task list panel**

```tsx
// src/components/parent/ParentChildTaskList.tsx
export function ParentChildTaskList({ tasks }: Props) {
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <HomeworkCard
          key={task.homeworkId}
          homework={...}
          statusText={task.statusText}
          proofType={task.proofType}
          awardedPoints={task.awardedPoints}
          scored={task.scored}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Update TodayOverview to compose both panels**

```tsx
// src/components/parent/TodayOverview.tsx
export function TodayOverview({ detail }: Props) {
  return (
    <div className="space-y-5">
      <ParentChildSummaryPanel summary={detail.summary} />
      <ParentChildTaskList tasks={detail.tasks} />
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/parent/TodayOverview.tsx src/components/parent/ParentChildSummaryPanel.tsx src/components/parent/ParentChildTaskList.tsx src/components/parent/HomeworkCard.tsx tests/unit/parent-dashboard.test.ts
git commit -m "feat: split parent overview into summary and task panels"
```

### Task 4: Wire The Parent Dashboard Page To The New Shapes

**Files:**
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Test: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing page-level tests**

```ts
it("shows all child summaries above the selected child detail", () => {
  render(<ParentDashboardPage />);
  expect(screen.getByText("Ivy")).toBeInTheDocument();
  expect(screen.getByText("今日任务")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: FAIL until the dashboard consumes the new builder.

- [ ] **Step 3: Load all-child inputs and build the dashboard state**

```tsx
// src/app/(parent)/dashboard/page.tsx
const dashboard = buildParentDashboard({
  children: childrenData,
  homeworks: homeworkData,
  checkIns: checkInData,
  date: formatDateKey(new Date()),
});
setSelectedChildId((current) => current ?? getDefaultSelectedChildId(dashboard.summaries));
```

- [ ] **Step 4: Render the new two-layer layout**

```tsx
{dashboard.summaries.length > 0 && (
  <>
    <ChildSelector summaries={dashboard.summaries} selectedId={selectedChildId} onSelect={setSelectedChildId} />
    {selectedDetail && <TodayOverview detail={selectedDetail} />}
  </>
)}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/'(parent)'/dashboard/page.tsx tests/unit/parent-dashboard.test.ts
git commit -m "feat: rebuild parent dashboard around child summaries"
```

### Task 5: Final Verification

**Files:**
- Test: `tests/unit/parent-dashboard.test.ts`
- Test: `tests/unit/homework-data.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts tests/unit/homework-data.test.ts`

Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm test -- --run`

Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/'(parent)'/dashboard/page.tsx src/components/parent/ChildSelector.tsx src/components/parent/TodayOverview.tsx src/components/parent/HomeworkCard.tsx src/components/parent/ChildSummaryCard.tsx src/components/parent/ParentChildSummaryPanel.tsx src/components/parent/ParentChildTaskList.tsx src/lib/parent-dashboard.ts tests/unit/parent-dashboard.test.ts tests/unit/homework-data.test.ts
git commit -m "feat: add child-summary-first parent dashboard"
```

## Self-Review

- Spec coverage: covers all-child summary cards, selected-child mixed detail, sorting/default selection, and reuses current parent assets.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: `ParentChildDashboardSummary` and `ParentChildDashboardDetail` are used consistently across plan tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-12-parent-dashboard-a-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
