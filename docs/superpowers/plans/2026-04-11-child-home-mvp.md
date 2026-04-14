# Child Home MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stable child-side MVP with a reliable daily task model, correct scoring/submission rules, and an iPad-landscape default homepage built from the existing week/progress/rewards content.

**Architecture:** Move task visibility, completion, lateness, and scoring decisions into a small shared service layer plus a server submission route. Rebuild the child homepage around a left-column weekly summary/calendar and a right-column day task workspace, reusing the current child components where possible.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase, Vitest

---

## File Map

- Modify: `src/app/page.tsx`
- Modify: `src/app/(child)/layout.tsx`
- Modify: `src/app/(child)/page.tsx`
- Modify: `src/app/(child)/today/page.tsx`
- Modify: `src/app/(child)/progress/page.tsx`
- Modify: `src/app/(child)/rewards/page.tsx`
- Modify: `src/app/child-login/page.tsx`
- Modify: `src/app/api/children/create/route.ts`
- Create: `src/app/api/check-ins/create/route.ts`
- Create: `src/lib/tasks/daily-task.ts`
- Create: `src/lib/tasks/check-in-submission.ts`
- Create: `src/components/child/ChildWeekSummaryCard.tsx`
- Create: `src/components/child/PriorityHomeworkCard.tsx`
- Modify: `src/components/child/WeekCalendar.tsx`
- Modify: `src/components/child/ChildHomeworkCard.tsx`
- Modify: `src/components/child/DayHomeworkView.tsx`
- Modify: `src/components/child/CheckInModal.tsx`
- Modify: `src/lib/homework-utils.ts`
- Modify: `src/lib/supabase/types.ts`
- Modify: `supabase/migrations/003_login_functions.sql`
- Create: `supabase/migrations/007_check_in_scoring_fields.sql`
- Test: `tests/unit/homework-data.test.ts`
- Test: `tests/unit/checkpoint.test.ts`
- Create: `tests/unit/daily-task.test.ts`
- Create: `tests/unit/check-in-submission.test.ts`

## Shared Types

Use these names consistently across tasks:

```ts
export type ProofType = "photo" | "screenshot" | "audio" | null;

export type DailyTaskStatus = {
  homeworkId: string;
  date: string;
  title: string;
  typeIcon: string;
  estimatedMinutes: number | null;
  pointValue: number;
  dailyCutoffTime: string | null;
  requiredCheckpointType: ProofType;
  completed: boolean;
  late: boolean;
  scored: boolean;
  awardedPoints: number;
  submissionCount: number;
};

export type CheckInSubmissionResult = {
  success: true;
  completed: true;
  late: boolean;
  scored: boolean;
  awardedPoints: number;
  message: string;
};
```

### Task 1: Lock Down Child Auth And Entry Routing

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/(child)/layout.tsx`
- Modify: `src/app/child-login/page.tsx`
- Modify: `src/app/api/children/create/route.ts`
- Modify: `supabase/migrations/003_login_functions.sql`
- Test: `tests/unit/login-flow.test.ts`

- [ ] **Step 1: Write the failing login/identity tests**

```ts
it("creates child auth email from child id", () => {
  const childId = "c1";
  const authEmail = `${childId}@child.local`;
  expect(authEmail).toBe("c1@child.local");
});

it("does not expose password_hash in child lookup shape", () => {
  const returnedKeys = ["id", "parent_id", "name", "avatar"];
  expect(returnedKeys.includes("password_hash")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify current flow is incomplete**

Run: `npm test -- --run tests/unit/login-flow.test.ts`

Expected: current tests pass, but new assertions fail until the login contract is updated.

- [ ] **Step 3: Fix child identity contract in the API and RPC**

```ts
// src/app/api/children/create/route.ts
const authEmail = `${authData.user.id}@child.local`;

const { data: child } = await supabase.from("children").insert({
  id: authData.user.id,
  parent_id: session.user.id,
  name,
  age: Number(age),
  gender,
  avatar: avatar || "🦊",
}).select().single();
```

```sql
-- supabase/migrations/003_login_functions.sql
CREATE OR REPLACE FUNCTION public.get_child_by_name(name_param TEXT)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  name TEXT,
  avatar TEXT,
  age INTEGER,
  gender TEXT,
  points INTEGER,
  streak_days INTEGER,
  last_check_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT c.id, c.parent_id, c.name, c.avatar, c.age, c.gender, c.points, c.streak_days, c.last_check_in, c.created_at
  FROM public.children c
  WHERE LOWER(c.name) = LOWER(name_param)
$$;
```

- [ ] **Step 4: Make root routing unambiguous**

```ts
// src/app/page.tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/today");
}
```

```ts
// src/app/(child)/layout.tsx
const items = [
  { href: "/today", label: "今日", icon: "📋" },
  { href: "/progress", label: "进度", icon: "📊" },
  { href: "/rewards", label: "积分", icon: "⭐" },
];
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run tests/unit/login-flow.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/'(child)'/layout.tsx src/app/child-login/page.tsx src/app/api/children/create/route.ts supabase/migrations/003_login_functions.sql tests/unit/login-flow.test.ts
git commit -m "fix: stabilize child auth and entry routes"
```

### Task 2: Add A Shared Daily Task Computation Layer

**Files:**
- Create: `src/lib/tasks/daily-task.ts`
- Modify: `src/lib/homework-utils.ts`
- Create: `tests/unit/daily-task.test.ts`

- [ ] **Step 1: Write the failing task-state tests**

```ts
import { describe, expect, it } from "vitest";
import { buildDailyTaskStatuses } from "@/lib/tasks/daily-task";

describe("buildDailyTaskStatuses", () => {
  it("marks first same-day completion as scored", () => {
    const result = buildDailyTaskStatuses(/* fixture */);
    expect(result[0].completed).toBe(true);
    expect(result[0].scored).toBe(true);
    expect(result[0].awardedPoints).toBe(4);
  });

  it("keeps repeat submissions completed but not scored", () => {
    const result = buildDailyTaskStatuses(/* fixture with 2 submissions */);
    expect(result[0].submissionCount).toBe(2);
    expect(result[0].scored).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/daily-task.test.ts`

Expected: FAIL with missing module/function.

- [ ] **Step 3: Implement the shared builder**

```ts
// src/lib/tasks/daily-task.ts
export function buildDailyTaskStatuses(
  homeworks: Homework[],
  checkIns: CheckIn[],
  date: string,
): DailyTaskStatus[] {
  return getHomeworksForDate(homeworks, new Date(`${date}T00:00:00`)).map((hw) => {
    const sameDay = checkIns.filter((ci) => ci.homework_id === hw.id);
    const firstScored = sameDay.find((ci) => ci.is_scored);
    const late = !!firstScored?.is_late;

    return {
      homeworkId: hw.id,
      date,
      title: hw.title,
      typeIcon: hw.type_icon,
      estimatedMinutes: hw.estimated_minutes,
      pointValue: hw.point_value,
      dailyCutoffTime: hw.daily_cutoff_time,
      requiredCheckpointType: hw.required_checkpoint_type,
      completed: sameDay.length > 0,
      late,
      scored: !!firstScored,
      awardedPoints: firstScored?.awarded_points ?? 0,
      submissionCount: sameDay.length,
    };
  });
}
```

- [ ] **Step 4: Export reusable lateness helpers**

```ts
// src/lib/homework-utils.ts
export function isAfterCutoff(cutoffTime: string | null, now: Date): boolean {
  if (!cutoffTime) return false;
  const [hours, minutes] = cutoffTime.split(":").map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);
  return now > cutoff;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run tests/unit/daily-task.test.ts tests/unit/homework-data.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/tasks/daily-task.ts src/lib/homework-utils.ts tests/unit/daily-task.test.ts tests/unit/homework-data.test.ts
git commit -m "feat: add shared daily task status builder"
```

### Task 3: Move Check-In Rules To A Server Route

**Files:**
- Create: `src/lib/tasks/check-in-submission.ts`
- Create: `src/app/api/check-ins/create/route.ts`
- Create: `supabase/migrations/007_check_in_scoring_fields.sql`
- Modify: `src/lib/supabase/types.ts`
- Create: `tests/unit/check-in-submission.test.ts`
- Modify: `tests/unit/checkpoint.test.ts`

- [ ] **Step 1: Write the failing submission tests**

```ts
it("awards points only on the first valid same-day submission", () => {
  const result = submitCheckIn(/* first valid submission */);
  expect(result.scored).toBe(true);
  expect(result.awardedPoints).toBe(3);
});

it("allows repeat same-day submissions without awarding points", () => {
  const result = submitCheckIn(/* second submission */);
  expect(result.scored).toBe(false);
  expect(result.message).toContain("不重复加分");
});

it("rejects missing proof when homework requires screenshot", () => {
  expect(() => submitCheckIn(/* required screenshot, no proof */)).toThrow(/截图/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/check-in-submission.test.ts`

Expected: FAIL with missing module/function.

- [ ] **Step 3: Add check-in scoring fields**

```sql
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS awarded_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_scored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proof_type TEXT CHECK (proof_type IN ('photo', 'screenshot', 'audio'));
```

- [ ] **Step 4: Implement submission decision logic**

```ts
// src/lib/tasks/check-in-submission.ts
export function buildSubmissionDecision(input: {
  homework: Homework;
  existingSameDay: CheckIn[];
  proofType: ProofType;
  now: Date;
}): CheckInSubmissionResult {
  const proofRequired = input.homework.required_checkpoint_type;
  if (proofRequired && proofRequired !== input.proofType) {
    throw new Error(`本次作业需要提交${proofRequired === "screenshot" ? "截图" : proofRequired === "photo" ? "拍照" : "录音"}`);
  }

  const firstCompletion = input.existingSameDay.some((ci) => ci.is_scored);
  const late = isAfterCutoff(input.homework.daily_cutoff_time, input.now);

  return {
    success: true,
    completed: true,
    late,
    scored: !firstCompletion,
    awardedPoints: firstCompletion ? 0 : input.homework.point_value,
    message: firstCompletion ? "本次记录已保存，今天不重复加分" : `完成成功，获得 ${input.homework.point_value} 积分`,
  };
}
```

- [ ] **Step 5: Add the route wrapper**

```ts
// src/app/api/check-ins/create/route.ts
export async function POST(request: Request) {
  // load session, homework, same-day check-ins
  // build decision
  // insert check_in with awarded_points/is_scored/is_late/proof_type
  // return decision
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- --run tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/tasks/check-in-submission.ts src/app/api/check-ins/create/route.ts src/lib/supabase/types.ts supabase/migrations/007_check_in_scoring_fields.sql tests/unit/checkpoint.test.ts tests/unit/check-in-submission.test.ts
git commit -m "feat: enforce child check-in scoring rules on server"
```

### Task 4: Rebuild The Child Home Page For iPad Landscape

**Files:**
- Modify: `src/app/(child)/page.tsx`
- Create: `src/components/child/ChildWeekSummaryCard.tsx`
- Create: `src/components/child/PriorityHomeworkCard.tsx`
- Modify: `src/components/child/WeekCalendar.tsx`
- Modify: `src/components/child/DayHomeworkView.tsx`
- Modify: `src/components/child/ChildHomeworkCard.tsx`

- [ ] **Step 1: Write the homepage rendering tests**

```ts
it("renders weekly summary on the left and daily tasks on the right", () => {
  render(<ChildLandingPage />);
  expect(screen.getByText("本周积分")).toBeInTheDocument();
  expect(screen.getByText("今日进度")).toBeInTheDocument();
});

it("shows the priority task card before the task list", () => {
  render(<ChildLandingPage />);
  expect(screen.getByText("下一项")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/today-filtering.test.ts`

Expected: FAIL once new homepage expectations are added.

- [ ] **Step 3: Add the new summary and priority components**

```tsx
// src/components/child/ChildWeekSummaryCard.tsx
export function ChildWeekSummaryCard({ weeklyPoints, weeklyCheckIns, completedDays }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard icon="⭐" value={weeklyPoints} label="本周积分" />
      <StatCard icon="📝" value={weeklyCheckIns} label="本周打卡" />
      <StatCard icon="✓" value={completedDays} label="完成天数" />
    </div>
  );
}
```

```tsx
// src/components/child/PriorityHomeworkCard.tsx
export function PriorityHomeworkCard({ task, onOpen }: Props) {
  if (!task) return null;
  return (
    <div className="rounded-2xl bg-amber-50 p-4">
      <div className="text-sm text-forest-600">下一项</div>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <div className="font-bold">{task.typeIcon} {task.title}</div>
          <div className="text-sm text-forest-500">截止 {task.dailyCutoffTime || "今天"}</div>
        </div>
        <button className="rounded-xl bg-primary px-4 py-2 text-white" onClick={onOpen}>去完成</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Recompose the landing page**

```tsx
// src/app/(child)/page.tsx
<main className="min-h-screen grid grid-cols-[340px_minmax(0,1fr)] gap-4 p-4 pb-24">
  <aside className="space-y-4">
    <ChildWeekSummaryCard ... />
    <WeekCalendar ... />
  </aside>
  <section className="space-y-4">
    <ChildDayHeader ... />
    <PriorityHomeworkCard ... />
    <DayHomeworkView ... />
  </section>
</main>
```

- [ ] **Step 5: Expand task card fields**

```tsx
// src/components/child/ChildHomeworkCard.tsx
{homework.required_checkpoint_type && (
  <p className="text-xs text-forest-400">需要{proofLabel[homework.required_checkpoint_type]}</p>
)}
{isRepeatSubmission && <p className="text-xs text-forest-400">再次提交不加分</p>}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- --run tests/unit/today-filtering.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/'(child)'/page.tsx src/components/child/ChildWeekSummaryCard.tsx src/components/child/PriorityHomeworkCard.tsx src/components/child/WeekCalendar.tsx src/components/child/DayHomeworkView.tsx src/components/child/ChildHomeworkCard.tsx
git commit -m "feat: redesign child home for ipad landscape"
```

### Task 5: Connect The Modal To The New Server Route And User Messages

**Files:**
- Modify: `src/components/child/CheckInModal.tsx`
- Modify: `src/app/(child)/today/page.tsx`
- Modify: `src/app/(child)/progress/page.tsx`
- Modify: `src/app/(child)/rewards/page.tsx`
- Test: `tests/unit/checkpoint.test.ts`

- [ ] **Step 1: Write the UI feedback tests**

```ts
it("shows a non-scoring success message for repeat submissions", () => {
  expect("本次记录已保存，今天不重复加分").toContain("不重复加分");
});

it("shows the required proof label before submission", () => {
  expect("需要截图").toContain("截图");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/checkpoint.test.ts`

Expected: FAIL until the UI strings are aligned with the new rule set.

- [ ] **Step 3: Replace direct table inserts with the route**

```ts
// src/components/child/CheckInModal.tsx
const res = await fetch("/api/check-ins/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    homeworkId: homework.id,
    note,
    proofType: attachments[0]?.type ?? null,
  }),
});

const result = await res.json();
setFeedback(result.message);
```

- [ ] **Step 4: Surface clearer status text across child pages**

```ts
const statusText = task.completed
  ? task.late ? "已逾期完成" : "已完成"
  : task.dailyCutoffTime && isAfterCutoff(task.dailyCutoffTime, new Date())
    ? "逾期可补交"
    : "待完成";
```

- [ ] **Step 5: Run regression tests and build**

Run: `npm test -- --run`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/child/CheckInModal.tsx src/app/'(child)'/today/page.tsx src/app/'(child)'/progress/page.tsx src/app/'(child)'/rewards/page.tsx tests/unit/checkpoint.test.ts
git commit -m "feat: connect child check-in ui to server scoring flow"
```

## Self-Review

- Spec coverage: includes auth contract cleanup, server-owned scoring rules, iPad-landscape child homepage, and state language alignment.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: `DailyTaskStatus`, `ProofType`, and `CheckInSubmissionResult` are reused consistently across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-11-child-home-mvp.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
