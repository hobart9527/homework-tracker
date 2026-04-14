# Parent Dashboard Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the parent dashboard to prioritize today's progress, add monthly calendar insights and reminder actions, and fix homework creation flow issues.

**Architecture:** Extend the existing parent dashboard data builder to support month navigation, monthly stats, hover summaries, reminder state, and check-in time analysis. Keep the UI changes inside the existing parent dashboard component tree, add a small reminder state machine on the backend, and make homework creation context-aware through query params and settings-driven quick type management.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase, Tailwind CSS, Vitest

---

## File Structure

- Modify: `src/lib/parent-dashboard.ts`
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Modify: `src/components/parent/ParentMonthCalendar.tsx`
- Modify: `src/components/parent/ParentMonthlyInsights.tsx`
- Modify: `src/components/parent/ParentDayDetailPanel.tsx`
- Modify: `src/components/parent/TodayOverview.tsx`
- Create: `src/components/parent/ParentMonthlyStats.tsx`
- Create: `src/components/parent/ParentCheckInHeatmap.tsx`
- Create: `src/components/parent/ReminderActionButton.tsx`
- Create: `src/lib/reminders.ts`
- Modify: `src/app/api/reminders/send/route.ts`
- Create: `src/app/api/reminders/escalate/route.ts`
- Modify: `src/components/parent/HomeworkForm.tsx`
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/app/(parent)/settings/page.tsx`
- Create: `src/components/parent/QuickTypeManager.tsx`
- Modify: `src/lib/homework-form.ts`
- Modify: `src/lib/supabase/types.ts`
- Create: `supabase/migrations/009_homework_reminders.sql`
- Modify: `tests/unit/parent-dashboard.test.ts`
- Create: `tests/unit/reminders.test.ts`
- Modify: `tests/unit/homework-form.test.ts`
- Create: `tests/unit/homework-list-page.test.ts`

### Task 1: Expand Parent Dashboard Data Model

**Files:**
- Modify: `src/lib/parent-dashboard.ts`
- Modify: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing tests for month stats, hover summaries, and heatmap data**

```ts
import { describe, expect, it } from "vitest";
import { buildParentDashboard } from "@/lib/parent-dashboard";

describe("buildParentDashboard", () => {
  it("builds monthly stats and calendar hover summaries for the selected month", () => {
    const dashboard = buildParentDashboard({
      children: [
        {
          id: "child-1",
          parent_id: "parent-1",
          name: "Mia",
          avatar: "🦊",
        } as any,
      ],
      homeworks: [
        {
          id: "hw-1",
          child_id: "child-1",
          created_by: "parent-1",
          title: "Math",
          type_name: "数学",
          type_icon: "📝",
          repeat_type: "daily",
          repeat_days: [],
          repeat_interval: 1,
          repeat_start_date: null,
          repeat_end_date: null,
          daily_cutoff_time: "20:00",
          point_value: 5,
          required_checkpoint_type: "",
          is_active: true,
        } as any,
      ],
      checkIns: [
        {
          id: "ci-1",
          child_id: "child-1",
          homework_id: "hw-1",
          completed_at: "2026-04-03T11:15:00.000Z",
          points_earned: 5,
        } as any,
      ],
      date: "2026-04-03",
      month: "2026-04",
      reminderStates: [],
    });

    expect(dashboard.monthlyStats.completionRate).toBeGreaterThan(0);
    expect(dashboard.calendarDays[2].tooltip.pendingTitles).toEqual([]);
    expect(dashboard.checkInHeatmap.some((bucket) => bucket.hour === 11)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`
Expected: FAIL with TypeScript or assertion errors because `month`, `monthlyStats`, `tooltip`, and `checkInHeatmap` do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export type ParentMonthlyStats = {
  completionRate: number;
  onTimeRate: number;
  totalPoints: number;
  makeupDays: number;
};

export type ParentCalendarDayTooltip = {
  assignedCount: number;
  completedCount: number;
  lateCompletedCount: number;
  pendingTitles: string[];
};

export type ParentCheckInHeatmapBucket = {
  hour: number;
  count: number;
};

export type ParentReminderState = {
  homeworkId: string;
  targetDate: string;
  status: "sent_sms" | "resolved_completed" | "escalated_call" | "failed";
  escalateAfter: string | null;
};

export type ParentMonthlyDashboard = {
  summaries: ParentChildDashboardSummary[];
  calendarDays: Array<ParentCalendarDay & { tooltip: ParentCalendarDayTooltip }>;
  selectedDayDetails: ParentChildDashboardDetail[];
  weakestTypes: ParentMonthlyInsight[];
  monthlyStats: ParentMonthlyStats;
  checkInHeatmap: ParentCheckInHeatmapBucket[];
};

function normalizeMonth(inputDate: string, month?: string) {
  return month ?? inputDate.slice(0, 7);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/parent-dashboard.test.ts src/lib/parent-dashboard.ts
git commit -m "feat: extend parent dashboard month data model"
```

### Task 2: Rebuild Parent Dashboard Layout Around Today-First Flow

**Files:**
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Modify: `src/components/parent/ParentMonthCalendar.tsx`
- Modify: `src/components/parent/ParentMonthlyInsights.tsx`
- Modify: `src/components/parent/ParentDayDetailPanel.tsx`
- Modify: `src/components/parent/TodayOverview.tsx`
- Create: `src/components/parent/ParentMonthlyStats.tsx`
- Create: `src/components/parent/ParentCheckInHeatmap.tsx`
- Test: `tests/unit/parent-dashboard.test.ts`

- [ ] **Step 1: Write the failing UI tests for reordered sections and month navigation**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ParentDashboardPage from "@/app/(parent)/dashboard/page";

describe("ParentDashboardPage", () => {
  it("renders today overview before monthly calendar and insights", async () => {
    render(<ParentDashboardPage />);

    expect(await screen.findByText("当天进展")).toBeInTheDocument();
    expect(screen.getByText("本月打卡日历")).toBeInTheDocument();
    expect(screen.getByText("热点时间段")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`
Expected: FAIL because the page does not render monthly stats, heatmap, or the new section labels yet.

- [ ] **Step 3: Write the minimal implementation**

```tsx
<main className="mx-auto max-w-6xl space-y-6 p-4">
  {selectedDetail ? (
    <TodayOverview detail={selectedDetail} selectedDate={selectedDate} />
  ) : null}

  <ParentMonthCalendar
    month={visibleMonth}
    days={dashboard.calendarDays}
    selectedDate={selectedDate}
    stats={dashboard.monthlyStats}
    onSelectDate={setSelectedDate}
    onChangeMonth={setVisibleMonth}
  />

  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
    <ParentMonthlyInsights weakestTypes={dashboard.weakestTypes} />
    <ParentCheckInHeatmap buckets={dashboard.checkInHeatmap} />
  </div>
</main>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/'(parent)'/dashboard/page.tsx src/components/parent/ParentMonthCalendar.tsx src/components/parent/ParentMonthlyInsights.tsx src/components/parent/ParentDayDetailPanel.tsx src/components/parent/TodayOverview.tsx src/components/parent/ParentMonthlyStats.tsx src/components/parent/ParentCheckInHeatmap.tsx tests/unit/parent-dashboard.test.ts
git commit -m "feat: redesign parent dashboard around today-first flow"
```

### Task 3: Add Reminder Action UI and Reminder State Loading

**Files:**
- Modify: `src/components/parent/ParentDayDetailPanel.tsx`
- Create: `src/components/parent/ReminderActionButton.tsx`
- Create: `src/lib/reminders.ts`
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Test: `tests/unit/reminders.test.ts`

- [ ] **Step 1: Write the failing tests for single-homework reminder states**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReminderActionButton } from "@/components/parent/ReminderActionButton";

describe("ReminderActionButton", () => {
  it("shows sms escalation message when a reminder is already pending", () => {
    render(
      <ReminderActionButton
        homeworkId="hw-1"
        childId="child-1"
        targetDate="2026-04-14"
        state={{
          homeworkId: "hw-1",
          targetDate: "2026-04-14",
          status: "sent_sms",
          escalateAfter: "2026-04-14T13:00:00.000Z",
        }}
      />
    );

    expect(screen.getByText(/已短信提醒/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: FAIL because `ReminderActionButton` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```tsx
export function ReminderActionButton(props: {
  homeworkId: string;
  childId: string;
  targetDate: string;
  state?: ParentReminderState | null;
}) {
  if (props.state?.status === "sent_sms") {
    return (
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
        已短信提醒 · 2小时后未完成将电话提醒
      </span>
    );
  }

  if (props.state?.status === "escalated_call") {
    return (
      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700">
        已电话提醒
      </span>
    );
  }

  return (
    <button
      type="button"
      className="rounded-full bg-primary px-3 py-2 text-xs font-medium text-white"
    >
      提醒孩子
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/parent/ParentDayDetailPanel.tsx src/components/parent/ReminderActionButton.tsx src/lib/reminders.ts src/app/'(parent)'/dashboard/page.tsx tests/unit/reminders.test.ts
git commit -m "feat: add parent reminder action ui states"
```

### Task 4: Implement Reminder Persistence, SMS Send, and Voice Escalation

**Files:**
- Create: `supabase/migrations/009_homework_reminders.sql`
- Modify: `src/lib/supabase/types.ts`
- Modify: `src/app/api/reminders/send/route.ts`
- Create: `src/app/api/reminders/escalate/route.ts`
- Create: `src/lib/reminders.ts`
- Test: `tests/unit/reminders.test.ts`

- [ ] **Step 1: Write the failing tests for reminder send and escalation flow**

```ts
import { describe, expect, it } from "vitest";
import { resolveReminderAction } from "@/lib/reminders";

describe("resolveReminderAction", () => {
  it("returns escalate_call when two hours passed and homework is still incomplete", () => {
    const result = resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T10:00:00.000Z",
      now: "2026-04-14T12:30:00.000Z",
      completed: false,
    });

    expect(result).toBe("escalate_call");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: FAIL because the reminder transition helper and DB-backed APIs do not exist.

- [ ] **Step 3: Write the minimal implementation**

```sql
create table public.homework_reminders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  homework_id uuid not null references public.homeworks(id) on delete cascade,
  target_date date not null,
  status text not null check (status in ('pending_initial','sent_sms','resolved_completed','escalated_call','failed')),
  initial_channel text not null default 'sms',
  escalation_channel text not null default 'voice_call',
  initial_sent_at timestamptz,
  escalate_after timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);
```

```ts
export function resolveReminderAction(input: {
  status: "sent_sms";
  escalateAfter: string;
  now: string;
  completed: boolean;
}) {
  if (input.completed) return "resolve_completed";
  if (new Date(input.now) >= new Date(input.escalateAfter)) return "escalate_call";
  return "noop";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_homework_reminders.sql src/lib/supabase/types.ts src/app/api/reminders/send/route.ts src/app/api/reminders/escalate/route.ts src/lib/reminders.ts tests/unit/reminders.test.ts
git commit -m "feat: add sms to voice reminder escalation flow"
```

### Task 5: Restore Quick-Type-First Homework Creation and Settings Management

**Files:**
- Modify: `src/components/parent/HomeworkForm.tsx`
- Modify: `src/lib/homework-form.ts`
- Modify: `src/app/(parent)/settings/page.tsx`
- Create: `src/components/parent/QuickTypeManager.tsx`
- Modify: `tests/unit/homework-form.test.ts`

- [ ] **Step 1: Write the failing tests for quick type ordering and title autofill preservation**

```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeworkForm } from "@/components/parent/HomeworkForm";

describe("HomeworkForm", () => {
  it("renders quick type selector before the title input", () => {
    render(<HomeworkForm />);

    const quickType = screen.getByLabelText("快捷类型（可选）");
    const title = screen.getByLabelText("作业标题");

    expect(quickType.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/homework-form.test.ts`
Expected: FAIL because the title input currently renders before the quick type block.

- [ ] **Step 3: Write the minimal implementation**

```tsx
<div className="space-y-6 rounded-3xl border border-forest-200 bg-white/90 p-5">
  <QuickTypeSelector
    allTypes={allTypes}
    value={formData.type_name}
    icon={formData.type_icon}
    onChange={handleQuickTypeChange}
    onPickIcon={setTypeIcon}
  />

  <Input
    label="作业标题"
    aria-label="作业标题"
    value={formData.title}
    onChange={(e) =>
      setFormData((prev) => ({ ...prev, title: e.target.value }))
    }
  />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/homework-form.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/parent/HomeworkForm.tsx src/lib/homework-form.ts src/app/'(parent)'/settings/page.tsx src/components/parent/QuickTypeManager.tsx tests/unit/homework-form.test.ts
git commit -m "feat: restore quick-type-first homework workflow"
```

### Task 6: Preserve Child Context When Creating Homework From Filtered View

**Files:**
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/components/parent/HomeworkForm.tsx`
- Create: `tests/unit/homework-list-page.test.ts`

- [ ] **Step 1: Write the failing tests for child-aware new homework links**

```ts
import { describe, expect, it } from "vitest";
import { buildNewHomeworkHref } from "@/lib/homework-form";

describe("buildNewHomeworkHref", () => {
  it("includes childId when a single child is selected", () => {
    expect(buildNewHomeworkHref({ selectedChildId: "child-1" })).toBe(
      "/homework/new?childId=child-1"
    );
  });

  it("omits childId when all children are selected", () => {
    expect(buildNewHomeworkHref({ selectedChildId: "all" })).toBe("/homework/new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/homework-list-page.test.ts`
Expected: FAIL because `buildNewHomeworkHref` and the new page query handling do not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function buildNewHomeworkHref(input: { selectedChildId: string }) {
  if (input.selectedChildId === "all") {
    return "/homework/new";
  }

  return `/homework/new?childId=${input.selectedChildId}`;
}
```

```tsx
type NewHomeworkPageProps = {
  searchParams?: {
    childId?: string | string[];
    copyFrom?: string | string[];
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/homework-list-page.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/'(parent)'/homework/page.tsx src/app/'(parent)'/homework/new/page.tsx src/components/parent/HomeworkForm.tsx tests/unit/homework-list-page.test.ts
git commit -m "fix: preserve child context when creating homework"
```

### Task 7: Full Verification Pass

**Files:**
- Test: `tests/unit/parent-dashboard.test.ts`
- Test: `tests/unit/reminders.test.ts`
- Test: `tests/unit/homework-form.test.ts`
- Test: `tests/unit/homework-list-page.test.ts`

- [ ] **Step 1: Run the focused test suite**

Run: `npm test -- --run tests/unit/parent-dashboard.test.ts tests/unit/reminders.test.ts tests/unit/homework-form.test.ts tests/unit/homework-list-page.test.ts`
Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: PASS with a successful Next.js production build

- [ ] **Step 4: Smoke-test the changed pages manually**

Run: `npm run dev`
Expected: `/dashboard`, `/homework`, `/homework/new`, and `/settings` all load without runtime errors

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: ship parent dashboard refresh and reminder workflow"
```

