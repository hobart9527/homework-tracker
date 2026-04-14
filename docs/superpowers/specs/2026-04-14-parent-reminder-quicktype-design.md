# Parent Reminder + Quick-Type + Child-Context Design Spec

> **Scope:** Tasks 3, 4, 5, 6 of the parent dashboard refresh plan.
> **Status:** Approved by user. Pending implementation plan.

---

## Task 3: Reminder Action Button UI

### Data Flow

```
ParentDayDetailPanel
  └── loads reminderStates from /api/reminders/send?parentId=...&month=...
  └── renders ReminderActionButton per task row
```

### States

| Status | UI | When |
|--------|----|------|
| `null` (no reminder sent) | Green "提醒孩子" button | Default |
| `sent_sms` | Amber badge: "已短信提醒 · 2小时后未完成将电话提醒" | After first click |
| `escalated_call` | Red badge: "已电话提醒" | 2h passed, still incomplete |
| `resolved_completed` | Green badge: "已完成" | Child completed |

### Layout

Each task row in `ParentDayDetailPanel` renders:
- Left: task title + type icon
- Right: `ReminderActionButton` badge (inline, single line, overflow ellipsis)

### API Contract

**GET /api/reminders/send**
- Query: `?parentId=&month=`
- Response: `{ reminderStates: ParentReminderState[] }`

**POST /api/reminders/send**
- Body: `{ homeworkId, childId, targetDate }`
- Response: `{ reminderState: ParentReminderState }`
- Behavior: upsert row in `homework_reminders`, status = `sent_sms`

**POST /api/reminders/escalate**
- Body: `{ reminderId }`
- Response: `{ reminderState: ParentReminderState }`
- Behavior: update status to `escalated_call`, set `escalated_at`

### Files

- Create: `src/components/parent/ReminderActionButton.tsx`
- Modify: `src/components/parent/ParentDayDetailPanel.tsx` (inject button into each task row)
- Modify: `src/app/(parent)/dashboard/page.tsx` (fetch and pass reminderStates)
- Create: `src/lib/reminders.ts` (state helpers, no external API calls)

---

## Task 4: Reminder Persistence

### Database Schema (migration 009)

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

### State Transition Helper

```ts
// lib/reminders.ts
export type ReminderTransitionResult = "noop" | "escalate_call" | "resolve_completed";

export function resolveReminderAction(input: {
  status: ParentReminderState["status"];
  escalateAfter: string | null;
  now: string;
  completed: boolean;
}): ReminderTransitionResult
```

Transition rules:
- `completed === true` → `resolve_completed`
- `status === "sent_sms"` AND `now >= escalateAfter` → `escalate_call`
- otherwise → `noop`

### Files

- Create: `supabase/migrations/009_homework_reminders.sql`
- Create: `src/app/api/reminders/send/route.ts` (GET + POST)
- Create: `src/app/api/reminders/escalate/route.ts` (POST)
- Create: `src/lib/reminders.ts`
- Modify: `src/lib/supabase/types.ts` (add `homework_reminders` table type)

---

## Task 5: Quick-Type Management in Settings

### DB Source

Read/write from existing `custom_homework_types` table (already exists in schema).

### Settings Page Structure

`/settings` page gets a new section "作业类型" (above or below existing sections):
- List of types with name, icon, default points
- "新增类型" button → inline form (name + icon picker + points)
- Each row: edit button + delete button
- Edit: inline form replacing the row

### HomeworkForm Changes

`HomeworkForm.tsx`:
- Load `custom_homework_types` from DB (append to hardcoded defaults)
- Render QuickTypeSelector before the title Input
- `handleQuickTypeChange` fills `type_name`, `type_icon` from selection

### Files

- Create: `src/components/parent/QuickTypeManager.tsx`
- Modify: `src/app/(parent)/settings/page.tsx` (inject QuickTypeManager)
- Modify: `src/components/parent/HomeworkForm.tsx` (load from DB, reorder)
- Modify: `src/lib/homework-form.ts` (no logic change, keep as-is)

---

## Task 6: Child Context in Homework Creation

### URL Contract

| Context | URL |
|---------|-----|
| From list, child selected | `/homework/new?childId=xxx` |
| From list, "all" selected | `/homework/new` |
| Direct nav | `/homework/new` |

### Implementation

```ts
// lib/homework-form.ts
export function buildNewHomeworkHref(input: {
  selectedChildId: string | null;
}): string {
  if (!input.selectedChildId || input.selectedChildId === "all") {
    return "/homework/new";
  }
  return `/homework/new?childId=${input.selectedChildId}`;
}
```

`/homework/new/page.tsx` searchParams:
```ts
searchParams?: {
  childId?: string | string[];
  copyFrom?: string | string[];
}
```

When `childId` is present:
1. Fetch the child record by ID
2. Set `formData.child_ids = [childId]`
3. Lock the child selector (disable multi-select, pre-check that child)

### Files

- Modify: `src/lib/homework-form.ts` (add `buildNewHomeworkHref`)
- Modify: `src/app/(parent)/homework/new/page.tsx` (read childId, prefill)
- Modify: `src/components/parent/HomeworkForm.tsx` (accept prefilled childIds, lock selector)
- Modify: `src/app/(parent)/homework/page.tsx` (use `buildNewHomeworkHref` for new-homework link)

---

## Implementation Order

1. Task 4 (DB migration + lib/reminders.ts + API routes) — no UI deps
2. Task 3 (ReminderActionButton + ParentDayDetailPanel + dashboard fetch) — depends on Task 4
3. Task 5 (QuickTypeManager + Settings + HomeworkForm reorder) — independent
4. Task 6 (buildNewHomeworkHref + new/page childId + homework/page link) — independent
5. Task 7 (full test suite + build + smoke test)

Tasks 3 and 5/6 can be implemented in parallel once Task 4 migration exists.

---

## Testing Strategy

| File | Test |
|------|------|
| `lib/reminders.ts` | `resolveReminderAction` all branches |
| `lib/homework-form.ts` | `buildNewHomeworkHref` all branches |
| `HomeworkForm.tsx` | QuickTypeSelector before title input |
| `ParentDayDetailPanel` | ReminderActionButton renders correct state |
| Integration | Full test suite + `npm run build` |
