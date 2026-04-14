# Parent Reminder + Quick-Type + Child-Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Tasks 3–6: reminder UI + persistence, quick-type management, child context in homework creation.

**Architecture:** Task 4 (migration + API) first as the foundation. Task 3 depends on it. Tasks 5 and 6 are independent of each other and can run in parallel after Task 4.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase, Tailwind CSS, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/009_homework_reminders.sql` | Create | DB schema for reminders |
| `src/lib/supabase/types.ts` | Modify | Add homework_reminders table type |
| `src/lib/reminders.ts` | Create | State transition helper |
| `src/app/api/reminders/send/route.ts` | Create | GET (list states) + POST (send SMS) |
| `src/app/api/reminders/escalate/route.ts` | Create | POST (escalate to call) |
| `src/components/parent/ReminderActionButton.tsx` | Create | Inline reminder state badge/button |
| `src/components/parent/ParentDayDetailPanel.tsx` | Modify | Inject button into task rows |
| `src/app/(parent)/dashboard/page.tsx` | Modify | Fetch and pass reminderStates |
| `src/components/parent/QuickTypeManager.tsx` | Create | CRUD list for custom types |
| `src/app/(parent)/settings/page.tsx` | Modify | Embed QuickTypeManager section |
| `src/lib/homework-form.ts` | Modify | Add buildNewHomeworkHref |
| `src/app/(parent)/homework/new/page.tsx` | Modify | Read childId, prefill & lock selector |
| `src/app/(parent)/homework/page.tsx` | Modify | Use buildNewHomeworkHref |
| `tests/unit/reminders.test.ts` | Create | resolveReminderAction tests |
| `tests/unit/homework-list-page.test.ts` | Create | buildNewHomeworkHref tests |

---

## Task 1: Reminder Persistence (DB + API)

### Reminder Migration

**File:** Create `supabase/migrations/009_homework_reminders.sql`

```sql
create table public.homework_reminders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  homework_id uuid not null references public.homeworks(id) on delete cascade,
  target_date date not null,
  status text not null check (
    status in ('pending_initial', 'sent_sms', 'resolved_completed', 'escalated_call', 'failed')
  ),
  escalation_channel text not null default 'voice_call',
  initial_sent_at timestamptz,
  escalated_at timestamptz,
  resolved_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  unique (homework_id, target_date)
);
```

- [ ] **Step 1: Create migration file**

Write the SQL above to `supabase/migrations/009_homework_reminders.sql`.

- [ ] **Step 2: Generate Supabase types**

Run: `npm run supabase:generate-types`
Expected: `src/lib/supabase/types.ts` now includes `homework_reminders` table type.

### State Transition Helper

**File:** Create `src/lib/reminders.ts`

```ts
import type { ParentReminderState } from "@/lib/parent-dashboard";

export type ReminderTransitionResult = "noop" | "escalate_call" | "resolve_completed";

export function resolveReminderAction(input: {
  status: ParentReminderState["status"];
  escalateAfter: string | null;
  now: string;
  completed: boolean;
}): ReminderTransitionResult {
  if (input.completed) return "resolve_completed";
  if (input.status === "sent_sms" && input.escalateAfter && new Date(input.now) >= new Date(input.escalateAfter)) {
    return "escalate_call";
  }
  return "noop";
}

export function buildReminderStateFromRow(row: {
  homework_id: string;
  target_date: string;
  status: string;
  escalate_after: string | null;
}): ParentReminderState {
  return {
    homeworkId: row.homework_id,
    targetDate: row.target_date,
    status: row.status as ParentReminderState["status"],
    escalateAfter: row.escalate_after,
  };
}
```

- [ ] **Step 3: Write failing tests for reminders.ts**

Create `tests/unit/reminders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveReminderAction } from "@/lib/reminders";

describe("resolveReminderAction", () => {
  it("returns resolve_completed when completed is true", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T10:00:00.000Z",
      completed: true,
    })).toBe("resolve_completed");
  });

  it("returns escalate_call when 2 hours passed after sms and still incomplete", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T14:00:00.000Z",
      completed: false,
    })).toBe("escalate_call");
  });

  it("returns noop when sms sent but not yet 2 hours", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: "2026-04-14T12:00:00.000Z",
      now: "2026-04-14T11:00:00.000Z",
      completed: false,
    })).toBe("noop");
  });

  it("returns noop when no reminder sent yet", () => {
    expect(resolveReminderAction({
      status: "sent_sms",
      escalateAfter: null,
      now: "2026-04-14T12:00:00.000Z",
      completed: false,
    })).toBe("noop");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: FAIL with "Cannot find module '@/lib/reminders'"

- [ ] **Step 5: Write minimal implementation**

Write `src/lib/reminders.ts` with the code above.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: PASS

### Reminder Send API (GET + POST)

**File:** Create `src/app/api/reminders/send/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import { buildReminderStateFromRow } from "@/lib/reminders";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  const month = searchParams.get("month");

  if (!parentId || !month) {
    return NextResponse.json({ error: "parentId and month are required" }, { status: 400 });
  }

  const startDate = `${month}-01`;
  const [year, monthNum] = month.split("-").map(Number);
  const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("homework_reminders")
    .select("*")
    .eq("parent_id", parentId)
    .gte("target_date", startDate)
    .lte("target_date", endDate);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminderStates = (data ?? []).map((row) =>
    buildReminderStateFromRow({
      homework_id: row.homework_id,
      target_date: row.target_date,
      status: row.status,
      escalate_after: row.initial_sent_at
        ? new Date(new Date(row.initial_sent_at).getTime() + 2 * 60 * 60 * 1000).toISOString()
        : null,
    })
  );

  return NextResponse.json({ reminderStates });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");

  const body = await request.json();
  const { homeworkId, childId, targetDate } = body;

  if (!homeworkId || !childId || !targetDate) {
    return NextResponse.json({ error: "homeworkId, childId, targetDate are required" }, { status: 400 });
  }

  const now = new Date();
  const escalateAfter = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("homework_reminders")
    .upsert(
      {
        parent_id: parentId ?? "",
        child_id: childId,
        homework_id: homeworkId,
        target_date: targetDate,
        status: "sent_sms",
        escalation_channel: "voice_call",
        initial_sent_at: now.toISOString(),
        escalate_after: escalateAfter,
      },
      { onConflict: "homework_id,target_date" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminderState = buildReminderStateFromRow({
    homework_id: data.homework_id,
    target_date: data.target_date,
    status: data.status,
    escalate_after: data.escalate_after,
  });

  return NextResponse.json({ reminderState });
}
```

- [ ] **Step 7: Write a simple smoke test for the GET handler**

Add to `tests/unit/reminders.test.ts`:

```ts
// Note: API route tests require mocking Supabase client.
// For now, focus on unit testing lib/reminders.ts (done above).
// The GET/POST routes are tested via integration smoke test in Task 7.
```

- [ ] **Step 8: Write minimal escalation API**

Create `src/app/api/reminders/escalate/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import { buildReminderStateFromRow } from "@/lib/reminders";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { reminderId } = body;

  if (!reminderId) {
    return NextResponse.json({ error: "reminderId is required" }, { status: 400 });
  }

  const supabase = createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("homework_reminders")
    .update({
      status: "escalated_call",
      escalated_at: now,
    })
    .eq("id", reminderId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminderState = buildReminderStateFromRow({
    homework_id: data.homework_id,
    target_date: data.target_date,
    status: data.status,
    escalate_after: data.escalate_after,
  });

  return NextResponse.json({ reminderState });
}
```

- [ ] **Step 9: Commit Task 1**

```bash
git add supabase/migrations/009_homework_reminders.sql \
  src/lib/reminders.ts \
  src/lib/supabase/types.ts \
  src/app/api/reminders/send/route.ts \
  src/app/api/reminders/escalate/route.ts \
  tests/unit/reminders.test.ts
git commit -m "feat: add reminder persistence layer (migration, API, state helpers)"
```

---

## Task 2: Reminder Action Button UI

**Files:**
- Create: `src/components/parent/ReminderActionButton.tsx`
- Modify: `src/components/parent/ParentDayDetailPanel.tsx`
- Modify: `src/app/(parent)/dashboard/page.tsx`

- [ ] **Step 1: Write failing test for ReminderActionButton**

Create `tests/unit/reminders.test.ts` additional test (or add to existing):

```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReminderActionButton } from "@/components/parent/ReminderActionButton";
import type { ParentReminderState } from "@/lib/parent-dashboard";

describe("ReminderActionButton", () => {
  it("renders green reminder button when no state", () => {
    render(<ReminderActionButton homeworkId="hw-1" childId="child-1" targetDate="2026-04-14" />);
    expect(screen.getByRole("button", { name: "提醒孩子" })).toBeInTheDocument();
  });

  it("renders amber badge when sms sent", () => {
    const state: ParentReminderState = {
      homeworkId: "hw-1",
      targetDate: "2026-04-14",
      status: "sent_sms",
      escalateAfter: new Date(Date.now() + 3600000).toISOString(),
    };
    render(<ReminderActionButton homeworkId="hw-1" childId="child-1" targetDate="2026-04-14" state={state} />);
    expect(screen.getByText(/已短信提醒/i)).toBeInTheDocument();
  });

  it("renders red badge when escalated", () => {
    const state: ParentReminderState = {
      homeworkId: "hw-1",
      targetDate: "2026-04-14",
      status: "escalated_call",
      escalateAfter: null,
    };
    render(<ReminderActionButton homeworkId="hw-1" childId="child-1" targetDate="2026-04-14" state={state} />);
    expect(screen.getByText(/已电话提醒/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: FAIL — `ReminderActionButton` does not exist.

- [ ] **Step 3: Write minimal ReminderActionButton component**

Create `src/components/parent/ReminderActionButton.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import type { ParentReminderState } from "@/lib/parent-dashboard";

interface ReminderActionButtonProps {
  homeworkId: string;
  childId: string;
  targetDate: string;
  state?: ParentReminderState | null;
  onRemind?: (homeworkId: string, childId: string, targetDate: string) => void;
}

export function ReminderActionButton({
  homeworkId,
  childId,
  targetDate,
  state,
  onRemind,
}: ReminderActionButtonProps) {
  if (state?.status === "escalated_call") {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 whitespace-nowrap">
        已电话提醒
      </span>
    );
  }

  if (state?.status === "sent_sms") {
    return (
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600 whitespace-nowrap">
        已短信提醒 · 2小时后未完成将电话提醒
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => onRemind?.(homeworkId, childId, targetDate)}
      className="whitespace-nowrap text-xs"
    >
      提醒孩子
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: PASS

- [ ] **Step 5: Inject button into ParentChildTaskList**

Read `src/components/parent/ParentChildTaskList.tsx` first. Add `reminderState` to task type and pass it to `HomeworkCard`. But since `HomeworkCard` is a shared component, instead modify `ParentChildTaskList` to accept `reminderStates` prop and render the button inline:

Modify `src/components/parent/ParentChildTaskList.tsx` to add `reminderStates` prop and render `ReminderActionButton` in each task row (after the existing task info, in a right-aligned div):

```tsx
// Add import
import { ReminderActionButton } from "@/components/parent/ReminderActionButton";
import type { ParentReminderState } from "@/lib/parent-dashboard";

interface ParentChildTaskListProps {
  tasks: Task[];
  reminderStates?: ParentReminderState[];
}
```

Find the `tasks.map` block and add the button after the `HomeworkCard` close:

```tsx
{/* Inside the map, after HomeworkCard */}
<div className="flex items-center justify-end mt-2">
  <ReminderActionButton
    homeworkId={task.homeworkId ?? ""}
    childId={""}
    targetDate={""}
    state={reminderStates?.find(
      (s) => s.homeworkId === task.homeworkId
    ) ?? null}
    onRemind={(homeworkId, childId, targetDate) => {
      // TODO: wire up to API call in dashboard page
    }}
  />
</div>
```

- [ ] **Step 6: Wire up dashboard page to fetch reminder states**

Modify `src/app/(parent)/dashboard/page.tsx`:
1. Add `reminderStates` state: `useState<ParentReminderState[]>([])`
2. In `fetchDashboard`, after fetching check-ins, call `GET /api/reminders/send?parentId=...&month=...`
3. Pass `reminderStates` to `<ParentChildTaskList reminderStates={reminderStates} />` via the `selectedDetail`

In the JSX, find where `<ParentChildTaskList tasks={detail.tasks} />` is rendered and change to:

```tsx
<ParentChildTaskList
  tasks={detail.tasks}
  reminderStates={reminderStates}
/>
```

- [ ] **Step 7: Wire up the remind button click to POST API**

In the `onRemind` callback inside `ParentChildTaskList`, make a POST call to `/api/reminders/send` with the homeworkId, childId, targetDate. After success, trigger a re-fetch of reminder states (add a `onReminderStateChange` callback up to the dashboard).

Simplest approach: use a React context or lift state to the dashboard. In `ParentDayDetailPanel`, add a `onReminderSent` callback. In `ParentChildTaskList`, accept and call it. In the dashboard page, pass a callback that re-fetches reminder states.

- [ ] **Step 8: Run tests**

Run: `npm test -- --run tests/unit/reminders.test.ts`
Expected: PASS

- [ ] **Step 9: Commit Task 2**

```bash
git add \
  src/components/parent/ReminderActionButton.tsx \
  src/components/parent/ParentChildTaskList.tsx \
  src/components/parent/ParentDayDetailPanel.tsx \
  src/app/'(parent)'/dashboard/page.tsx \
  tests/unit/reminders.test.ts
git commit -m "feat: add reminder action button UI with state badges"
```

---

## Task 3: Quick-Type Manager in Settings

**Files:**
- Create: `src/components/parent/QuickTypeManager.tsx`
- Modify: `src/app/(parent)/settings/page.tsx`
- Modify: `src/components/parent/HomeworkForm.tsx` (reorder: QuickTypeSelector before title)

- [ ] **Step 1: Write failing test for QuickTypeManager**

Create `tests/unit/quick-type-manager.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuickTypeManager } from "@/components/parent/QuickTypeManager";

describe("QuickTypeManager", () => {
  it("renders a list of existing types", () => {
    render(
      <QuickTypeManager
        types={[
          { id: "1", name: "钢琴", icon: "🎹", default_points: 6, is_custom: true },
        ]}
        onAdd={async () => {}}
        onUpdate={async () => {}}
        onDelete={async () => {}}
      />
    );
    expect(screen.getByText("钢琴")).toBeInTheDocument();
    expect(screen.getByText("🎹")).toBeInTheDocument();
  });

  it("renders an add button", () => {
    render(
      <QuickTypeManager
        types={[]}
        onAdd={async () => {}}
        onUpdate={async () => {}}
        onDelete={async () => {}}
      />
    );
    expect(screen.getByRole("button", { name: "新增类型" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/quick-type-manager.test.ts`
Expected: FAIL — `QuickTypeManager` does not exist.

- [ ] **Step 3: Write minimal QuickTypeManager**

Create `src/components/parent/QuickTypeManager.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Database } from "@/lib/supabase/types";

type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];

interface QuickTypeManagerProps {
  types: CustomType[];
  onAdd: (name: string, icon: string, points: number) => Promise<void>;
  onUpdate: (id: string, name: string, icon: string, points: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const ICONS = ["📝", "✏️", "📋", "🎨", "⚽", "🏀", "🎸", "🧮", "🔬", "📐", "✍️", "🗣️", "🎹", "📖", "💻", "📚", "🔢", "🇨🇳", "🏐", "👯", "🎭", "🧹", "📸", "🎵", "🌟"];

export function QuickTypeManager({ types, onAdd, onUpdate, onDelete }: QuickTypeManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("📝");
  const [formPoints, setFormPoints] = useState(3);

  const handleAdd = async () => {
    await onAdd(formName, formIcon, formPoints);
    setShowForm(false);
    setFormName("");
    setFormIcon("📝");
    setFormPoints(3);
  };

  const handleEdit = (type: CustomType) => {
    setEditingId(type.id);
    setFormName(type.name);
    setFormIcon(type.icon || "📝");
    setFormPoints(type.default_points ?? 3);
    setShowForm(true);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await onUpdate(editingId, formName, formIcon, formPoints);
    setEditingId(null);
    setShowForm(false);
    setFormName("");
    setFormIcon("📝");
    setFormPoints(3);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-forest-700">作业类型</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            + 新增类型
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-2xl border border-forest-200 bg-forest-50 p-4 space-y-3">
          <Input
            label="类型名称"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="如：钢琴、阅读"
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-forest-600">选择图标</p>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormIcon(icon)}
                  className={`text-2xl p-2 rounded-xl transition ${
                    formIcon === icon ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-forest-100"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="默认积分"
            type="number"
            value={formPoints}
            onChange={(e) => setFormPoints(Number(e.target.value))}
            min={1}
            max={20}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={editingId ? handleSaveEdit : handleAdd}>
              {editingId ? "保存" : "添加"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormName("");
                setFormIcon("📝");
                setFormPoints(3);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {types.length === 0 && !showForm ? (
        <p className="text-sm text-forest-400">还没有自定义类型</p>
      ) : (
        <div className="space-y-2">
          {types.map((type) => (
            <div key={type.id} className="flex items-center gap-3 rounded-xl border border-forest-100 bg-white px-4 py-3">
              <span className="text-2xl">{type.icon || "📝"}</span>
              <div className="flex-1">
                <p className="font-medium text-forest-700">{type.name}</p>
                <p className="text-xs text-forest-400">{type.default_points ?? 3} 积分</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleEdit(type)}>
                编辑
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(type.id)} className="text-red-500">
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/quick-type-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Add QuickTypeManager to Settings page**

Read `src/app/(parent)/settings/page.tsx`. Add `QuickTypeManager` to the settings page:

```tsx
// Add import
import { QuickTypeManager } from "@/components/parent/QuickTypeManager";
import type { Database } from "@/lib/supabase/types";

type CustomType = Database["public"]["Tables"]["custom_homework_types"]["Row"];
```

In the component, add state and fetch:

```tsx
const [customTypes, setCustomTypes] = useState<CustomType[]>([]);

useEffect(() => {
  const fetchTypes = async () => {
    const { data } = await supabase
      .from("custom_homework_types")
      .select("*")
      .eq("parent_id", session.user.id);
    if (data) setCustomTypes(data);
  };
  if (session) fetchTypes();
}, [supabase, session]);
```

Add a new Card section after the "提醒设置" card:

```tsx
<Card>
  <QuickTypeManager
    types={customTypes}
    onAdd={async (name, icon, points) => {
      const { data } = await supabase.from("custom_homework_types").insert({
        parent_id: session.user.id,
        name,
        icon,
        default_points: points,
      }).select().single();
      if (data) setCustomTypes((prev) => [...prev, data]);
    }}
    onUpdate={async (id, name, icon, points) => {
      await supabase.from("custom_homework_types").update({ name, icon, default_points: points }).eq("id", id);
      setCustomTypes((prev) => prev.map((t) => t.id === id ? { ...t, name, icon, default_points: points } : t));
    }}
    onDelete={async (id) => {
      await supabase.from("custom_homework_types").delete().eq("id", id);
      setCustomTypes((prev) => prev.filter((t) => t.id !== id));
    }}
  />
</Card>
```

- [ ] **Step 6: Reorder HomeworkForm so QuickTypeSelector renders before title input**

Read `src/components/parent/HomeworkForm.tsx`. Find the section with `<Input label="作业标题"`. Move the `<QuickTypeSelector>` block (or the quick-type selection UI) to render before the title input. The existing `handleTypeSelect` already auto-fills title — just ensure the UI renders in the right order visually.

- [ ] **Step 7: Run all tests**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 8: Commit Task 3**

```bash
git add \
  src/components/parent/QuickTypeManager.tsx \
  src/app/'(parent)'/settings/page.tsx \
  src/components/parent/HomeworkForm.tsx \
  tests/unit/quick-type-manager.test.ts
git commit -m "feat: add quick-type manager to settings page"
```

---

## Task 4: Child Context in Homework Creation

**Files:**
- Modify: `src/lib/homework-form.ts`
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/app/(parent)/homework/page.tsx`

- [ ] **Step 1: Write failing test for buildNewHomeworkHref**

Create `tests/unit/homework-list-page.test.ts`:

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

  it("omits childId when selectedChildId is null", () => {
    expect(buildNewHomeworkHref({ selectedChildId: null })).toBe("/homework/new");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/homework-list-page.test.ts`
Expected: FAIL — `buildNewHomeworkHref` does not exist.

- [ ] **Step 3: Add buildNewHomeworkHref to homework-form.ts**

Append to `src/lib/homework-form.ts`:

```ts
export function buildNewHomeworkHref(input: {
  selectedChildId: string | null;
}): string {
  if (!input.selectedChildId || input.selectedChildId === "all") {
    return "/homework/new";
  }
  return `/homework/new?childId=${input.selectedChildId}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/unit/homework-list-page.test.ts`
Expected: PASS

- [ ] **Step 5: Update homework list page to use buildNewHomeworkHref**

Read `src/app/(parent)/homework/page.tsx`. Find the "新建" link:

```tsx
<Link href="/homework/new">
  <Button size="sm" variant="secondary">
    + 新建
  </Button>
</Link>
```

Change to:

```tsx
<Link href={buildNewHomeworkHref({ selectedChildId })}>
  <Button size="sm" variant="secondary">
    + 新建
  </Button>
</Link>
```

Add the import at the top:

```tsx
import { buildHomeworkListView, buildNewHomeworkHref } from "@/lib/homework-list";
```

Wait — check what `homework-list.ts` exports. If `buildNewHomeworkHref` is already in `homework-form.ts`, import from there instead:

```tsx
import { buildNewHomeworkHref } from "@/lib/homework-form";
```

- [ ] **Step 6: Update new homework page to read childId from searchParams**

Read `src/app/(parent)/homework/new/page.tsx`. Add `childId` to the `searchParams` type and pass it to `HomeworkForm`:

```tsx
type NewHomeworkPageProps = {
  searchParams?: {
    childId?: string | string[];
    copyFrom?: string | string[];
  };
};

export default function NewHomeworkPage({ searchParams }: NewHomeworkPageProps) {
  const childIdParam = searchParams?.childId;
  const childId = typeof childIdParam === "string" ? childIdParam : childIdParam?.[0];

  return (
    <div className="min-h-screen bg-background">
      ...
      <main className="max-w-6xl mx-auto p-4">
        <HomeworkForm prefilledChildId={childId} />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Update HomeworkForm to accept prefilledChildId and lock selector**

Read `src/components/parent/HomeworkForm.tsx`. Find the interface:

```tsx
interface HomeworkFormProps {
  homework?: Database["public"]["Tables"]["homeworks"]["Row"];
  copyFromHomeworkId?: string;
  onSuccess?: () => void;
}
```

Change to:

```tsx
interface HomeworkFormProps {
  homework?: Database["public"]["Tables"]["homeworks"]["Row"];
  copyFromHomeworkId?: string;
  prefilledChildId?: string;
  onSuccess?: () => void;
}
```

In the component function, accept `prefilledChildId`:

```tsx
export function HomeworkForm({
  homework,
  copyFromHomeworkId,
  prefilledChildId,
  onSuccess,
}: HomeworkFormProps) {
```

In the second `useEffect` (the one that handles copy), add handling for prefilled childId. When `prefilledChildId` is present and `formData.child_ids` is empty:

```tsx
useEffect(() => {
  if (prefilledChildId && !formData.child_ids.length) {
    setFormData((prev) => ({ ...prev, child_ids: [prefilledChildId] }));
  }
}, [prefilledChildId, formData.child_ids.length]);
```

For the `canBatchAssign` logic, change:
```tsx
const canBatchAssign = !isEditing && !prefilledChildId;
```

And in `HomeworkAssignmentPanel`, pass the locked state:
```tsx
<HomeworkAssignmentPanel
  ...
  canBatchAssign={canBatchAssign}
  ...
/>
```

- [ ] **Step 8: Run tests**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 9: Commit Task 4**

```bash
git add \
  src/lib/homework-form.ts \
  src/app/'(parent)'/homework/new/page.tsx \
  src/app/'(parent)'/homework/page.tsx \
  src/components/parent/HomeworkForm.tsx \
  tests/unit/homework-list-page.test.ts
git commit -m "fix: preserve child context when creating homework from filtered view"
```

---

## Task 5: Full Verification Pass

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: PASS (all 108+ tests)

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS with successful Next.js production build

- [ ] **Step 3: Commit all remaining changes**

```bash
git add .
git commit -m "feat: ship reminder system, quick-type manager, child context"
```
