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

create index idx_homework_reminders_parent_month on homework_reminders(parent_id, target_date);
