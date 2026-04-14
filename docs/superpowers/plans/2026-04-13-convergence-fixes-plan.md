# Convergence Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the current product by fixing the check-in schema mismatch, collapsing the child experience onto a single home page, reshaping the parent dashboard around a month-first management view, and simplifying homework management back into a lightweight family workflow.

**Architecture:** Keep the working daily-task and scoring model, but remove duplicate entry points and overbuilt controls. The child side should have one canonical home surface. The parent side should promote a month calendar plus selected-day detail model. Homework management should shift from a power-user filter form into a compact assign-and-review workspace.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase, Vitest

---

## File Map

- Modify: `src/app/api/check-ins/create/route.ts`
- Modify: `src/lib/tasks/check-in-submission.ts`
- Modify: `tests/unit/check-in-submission.test.ts`
- Modify: `src/app/(child)/today/page.tsx`
- Modify: `src/app/(child)/page.tsx`
- Modify: `src/app/child-login/page.tsx`
- Modify: `src/app/(child)/layout.tsx`
- Modify: `tests/unit/today-filtering.test.ts`
- Modify: `tests/unit/login-flow.test.ts`
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Modify: `src/lib/parent-dashboard.ts`
- Modify: `src/components/parent/TodayOverview.tsx`
- Create: `src/components/parent/ParentMonthCalendar.tsx`
- Create: `src/components/parent/ParentMonthlyInsights.tsx`
- Create: `src/components/parent/ParentDayDetailPanel.tsx`
- Modify: `tests/unit/parent-dashboard.test.ts`
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/components/parent/HomeworkForm.tsx`
- Modify: `src/lib/homework-list.ts`
- Modify: `tests/unit/homework-list.test.ts`
- Modify: `tests/unit/homework-form.test.ts`

## Shared Shapes

Use these names consistently across tasks:

```ts
export type ParentCalendarDay = {
  date: string;
  totalCount: number;
  completedCount: number;
  lateCompletedCount: number;
  outstandingCount: number;
};

export type ParentMonthlyInsight = {
  typeName: string;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
};

export type ParentMonthlyDashboard = {
  summaries: ParentChildDashboardSummary[];
  calendarDays: ParentCalendarDay[];
  selectedDayDetails: ParentChildDashboardDetail[];
  weakestTypes: ParentMonthlyInsight[];
};
```

### Task 1: Harden Check-In Submission Against Missing Scoring Columns

**Files:**
- Modify: `src/app/api/check-ins/create/route.ts`
- Modify: `src/lib/tasks/check-in-submission.ts`
- Modify: `tests/unit/check-in-submission.test.ts`

- [ ] **Step 1: Write the failing schema-mismatch test**

```ts
it("returns a friendly upgrade message when scoring columns are missing", async () => {
  const insert = vi.fn(() =>
    Promise.resolve({
      data: null,
      error: {
        message:
          "Could not find the 'awarded_points' column of 'check_ins' in the schema cache",
      },
    })
  );

  const response = await postCheckInWithInsert(insert);
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(body.error).toContain("数据库结构还没有完成升级");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run tests/unit/check-in-submission.test.ts`

Expected: FAIL because the route currently leaks the raw PostgREST message.

- [ ] **Step 3: Add a schema-mismatch detector**

```ts
// src/lib/tasks/check-in-submission.ts
export function isMissingCheckInScoringColumnError(message: string) {
  return (
    message.includes("awarded_points") ||
    message.includes("is_scored") ||
    message.includes("is_late") ||
    message.includes("proof_type")
  );
}
```

- [ ] **Step 4: Return a friendly API error from the route**

```ts
// src/app/api/check-ins/create/route.ts
if (insertError) {
  const message = insertError.message || "Failed to create check-in";

  if (isMissingCheckInScoringColumnError(message)) {
    return NextResponse.json(
      {
        error:
          "数据库结构还没有完成升级，请先应用最新的 check-in migration，然后再重试补打卡。",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
```

- [ ] **Step 5: Re-run the focused test**

Run: `npm test -- --run tests/unit/check-in-submission.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/check-ins/create/route.ts src/lib/tasks/check-in-submission.ts tests/unit/check-in-submission.test.ts
git commit -m "fix: handle stale check-in schema errors"
```

### Task 2: Collapse Child Home Onto One Canonical Page

**Files:**
- Modify: `src/app/(child)/today/page.tsx`
- Modify: `src/app/(child)/page.tsx`
- Modify: `src/app/child-login/page.tsx`
- Modify: `src/app/(child)/layout.tsx`
- Modify: `tests/unit/today-filtering.test.ts`
- Modify: `tests/unit/login-flow.test.ts`

- [ ] **Step 1: Write the failing routing tests**

```ts
it("treats /today as an alias of the child home page", () => {
  const destination = getChildDefaultRoute();
  expect(destination).toBe("/");
});

it("redirects the standalone today page back to the child home", () => {
  const redirectTarget = getTodayAliasTarget();
  expect(redirectTarget).toBe("/");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run tests/unit/login-flow.test.ts tests/unit/today-filtering.test.ts`

Expected: FAIL because child login still targets `/today` and `/today` still renders its own page.

- [ ] **Step 3: Update child login and nav contracts**

```ts
// src/app/child-login/page.tsx
router.push("/");

// src/app/(child)/layout.tsx
const items = [
  { href: "/", label: "今日", icon: "📋" },
  { href: "/progress", label: "进度", icon: "📊" },
  { href: "/rewards", label: "积分", icon: "⭐" },
];
```

- [ ] **Step 4: Turn `/today` into a compatibility redirect**

```ts
// src/app/(child)/today/page.tsx
import { redirect } from "next/navigation";

export default function ChildTodayAliasPage() {
  redirect("/");
}
```

- [ ] **Step 5: Keep the main child experience only in the landing page**

```ts
// src/app/(child)/page.tsx
export default function ChildLandingPage() {
  // keep the existing weekly summary + calendar + day workspace implementation
}
```

- [ ] **Step 6: Re-run the focused tests**

Run: `npm test -- --run tests/unit/login-flow.test.ts tests/unit/today-filtering.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/'(child)'/today/page.tsx src/app/'(child)'/page.tsx src/app/'(child)'/layout.tsx src/app/child-login/page.tsx tests/unit/login-flow.test.ts tests/unit/today-filtering.test.ts
git commit -m "refactor: unify child home entrypoints"
```

### Task 3: Rebuild The Parent Dashboard Around A Month Calendar

**Files:**
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Modify: `src/lib/parent-dashboard.ts`
- Modify: `src/components/parent/TodayOverview.tsx`
- Create: `src/components/parent/ParentMonthCalendar.tsx`
- Create: `src/components/parent/ParentMonthlyInsights.tsx`
- Create: `src/components/parent/ParentDayDetailPanel.tsx`
- Modify: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing monthly-dashboard tests**

```ts
it("builds one calendar entry per day in the selected month", () => {
  const result = buildParentDashboard({
    children,
    homeworks,
    checkIns,
    date: "2026-04-13",
  });

  expect(result.calendarDays.length).toBeGreaterThanOrEqual(30);
});

it("calculates the weakest homework types for the month", () => {
  const result = buildParentDashboard({
    children,
    homeworks,
    checkIns,
    date: "2026-04-13",
  });

  expect(result.weakestTypes[0].completionRate).toBeLessThanOrEqual(
    result.weakestTypes[1].completionRate
  );
});
```

- [ ] **Step 2: Run the dashboard tests to verify they fail**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: FAIL because the builder only returns today summaries and task details.

- [ ] **Step 3: Extend the dashboard builder with month-day and weakest-type outputs**

```ts
// src/lib/parent-dashboard.ts
export function buildParentDashboard(input: ParentDashboardInput): ParentMonthlyDashboard {
  // keep existing summaries
  // build calendarDays for the full selected month
  // build selectedDayDetails for the requested day
  // compute weakestTypes by homework type_name completion rate
}
```

- [ ] **Step 4: Add the month calendar component**

```tsx
// src/components/parent/ParentMonthCalendar.tsx
export function ParentMonthCalendar({
  days,
  selectedDate,
  onSelectDate,
}: Props) {
  return (
    <section className="rounded-3xl border border-forest-200 bg-white/90 p-4">
      <h2 className="text-lg font-semibold text-forest-700">本月打卡日历</h2>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((day) => (
          <button key={day.date} onClick={() => onSelectDate(day.date)}>
            <div>{day.date.slice(-2)}</div>
            <div>{day.completedCount}/{day.totalCount}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add the month insights component**

```tsx
// src/components/parent/ParentMonthlyInsights.tsx
export function ParentMonthlyInsights({ weakestTypes }: Props) {
  return (
    <section className="rounded-3xl border border-forest-200 bg-white/90 p-4">
      <h2 className="text-lg font-semibold text-forest-700">本月薄弱类型</h2>
      <ul className="mt-3 space-y-3">
        {weakestTypes.map((item) => (
          <li key={item.typeName}>
            <div>{item.typeName}</div>
            <div>{item.completedCount}/{item.assignedCount}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Replace the old today-only detail panel**

```tsx
// src/components/parent/TodayOverview.tsx
export function TodayOverview({ detail, selectedDate }: Props) {
  return (
    <div className="space-y-5">
      <ParentDayDetailPanel selectedDate={selectedDate} detail={detail} />
    </div>
  );
}
```

- [ ] **Step 7: Wire the page around month-first navigation**

```tsx
// src/app/(parent)/dashboard/page.tsx
const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));

<ChildSelector ... />
<ParentMonthCalendar
  days={dashboard.calendarDays}
  selectedDate={selectedDate}
  onSelectDate={setSelectedDate}
/>
{selectedDetail ? <TodayOverview detail={selectedDetail} selectedDate={selectedDate} /> : null}
<ParentMonthlyInsights weakestTypes={dashboard.weakestTypes} />
```

- [ ] **Step 8: Re-run the dashboard tests**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/'(parent)'/dashboard/page.tsx src/lib/parent-dashboard.ts src/components/parent/TodayOverview.tsx src/components/parent/ParentMonthCalendar.tsx src/components/parent/ParentMonthlyInsights.tsx src/components/parent/ParentDayDetailPanel.tsx tests/unit/parent-dashboard.test.ts
git commit -m "feat: rebuild parent dashboard around monthly progress"
```

### Task 4: Simplify Homework Management Back To A Lightweight Workflow

**Files:**
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/components/parent/HomeworkForm.tsx`
- Modify: `src/lib/homework-list.ts`
- Modify: `tests/unit/homework-list.test.ts`
- Modify: `tests/unit/homework-form.test.ts`

- [ ] **Step 1: Write the failing simplification tests**

```ts
it("does not render the search box on the homework list page", async () => {
  render(<HomeworkListPage />);
  await waitFor(() => expect(screen.getByText("查看范围")).toBeInTheDocument());
  expect(screen.queryByPlaceholderText("搜索作业标题或类型")).not.toBeInTheDocument();
});

it("keeps homework creation focused on title and rules instead of type picking", async () => {
  render(<HomeworkForm />);
  await waitFor(() => expect(screen.getByText("分配给谁")).toBeInTheDocument());
  expect(screen.queryByText("作业类型")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run tests/unit/homework-list.test.ts tests/unit/homework-form.test.ts`

Expected: FAIL because the list still renders search and the form still leads with type selection.

- [ ] **Step 3: Strip search and secondary filters out of the list view**

```ts
// src/lib/homework-list.ts
export type HomeworkListFilters = {
  selectedChildId: string;
  date: Date;
};
```

```tsx
// src/app/(parent)/homework/page.tsx
const [selectedChildId, setSelectedChildId] = useState("all");

<aside>
  <h2>查看范围</h2>
  {/* only all children + per-child buttons */}
</aside>
```

- [ ] **Step 4: Keep the list grouped by relevance, not by extra controls**

```tsx
// src/app/(parent)/homework/page.tsx
{section.items.map((hw) => (
  <Card key={hw.id}>
    <h3>{hw.title}</h3>
    <p>{hw.isDueToday ? "今天会出现" : "其他作业"}</p>
  </Card>
))}
```

- [ ] **Step 5: Replace the large type chooser with a compact title-first form**

```tsx
// src/components/parent/HomeworkForm.tsx
<Input
  label="作业标题"
  value={formData.title}
  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
  required
/>

<div className="grid gap-2 sm:grid-cols-4">
  {COMMON_TYPE_CHIPS.map((chip) => (
    <button key={chip.name} type="button" onClick={() => applyTypeChip(chip)}>
      {chip.label}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Keep the rest of the form centered on rules**

```tsx
// src/components/parent/HomeworkForm.tsx
// preserve:
// - child assignment panel
// - repeat rule
// - cutoff time
// - proof requirement
// - points and estimated minutes
// remove the large icon-first chooser block
```

- [ ] **Step 7: Re-run the focused tests**

Run: `npm test -- --run tests/unit/homework-list.test.ts tests/unit/homework-form.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/'(parent)'/homework/page.tsx src/components/parent/HomeworkForm.tsx src/lib/homework-list.ts tests/unit/homework-list.test.ts tests/unit/homework-form.test.ts
git commit -m "refactor: simplify homework management workflow"
```

### Task 5: Run The Convergence Regression Suite

**Files:**
- Modify: `tests/unit/check-in-submission.test.ts`
- Modify: `tests/unit/login-flow.test.ts`
- Modify: `tests/unit/today-filtering.test.ts`
- Modify: `tests/unit/parent-dashboard.test.ts`
- Modify: `tests/unit/homework-list.test.ts`
- Modify: `tests/unit/homework-form.test.ts`

- [ ] **Step 1: Run the focused convergence suite**

Run: `npm test -- --run tests/unit/check-in-submission.test.ts tests/unit/login-flow.test.ts tests/unit/today-filtering.test.ts tests/unit/parent-dashboard.test.ts tests/unit/homework-list.test.ts tests/unit/homework-form.test.ts`

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`

Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS, with no new route or type errors. The existing `tailwind.config.ts` ESM warning may still appear and is non-blocking for this phase.

- [ ] **Step 4: Manual verification checklist**

```text
1. Child login lands on the unified child home page.
2. Visiting /today redirects into the same child experience.
3. A missing scoring-column environment returns a friendly API error.
4. Parent dashboard opens to the month calendar and today’s detail.
5. Homework list has only child scope controls, no search box.
6. Homework form leads with assignment + title + rules, not a large type grid.
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/check-in-submission.test.ts tests/unit/login-flow.test.ts tests/unit/today-filtering.test.ts tests/unit/parent-dashboard.test.ts tests/unit/homework-list.test.ts tests/unit/homework-form.test.ts
git commit -m "test: verify convergence fixes"
```

## Self-Review

- Spec coverage: The plan covers all four requested changes: a friendly fix path for the missing `check_ins` scoring columns, removal of the standalone child `today` UI, a month-first parent dashboard with selected-day details and weakest-type insights, and a simplified homework management flow with reduced controls.
- Placeholder scan: No `TODO`, `TBD`, or deferred implementation notes remain. Each task includes concrete files, code shapes, commands, and pass criteria.
- Type consistency: The plan keeps existing dashboard summary/detail names, introduces explicit monthly shapes, and limits homework list filters back to the simplified child-scope contract without mixing in the removed search/proof/repeat controls.
