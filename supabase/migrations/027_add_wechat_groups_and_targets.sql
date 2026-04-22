create table if not exists public.wechat_groups (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  recipient_ref text not null,
  display_name text,
  source text not null default 'discovered',
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (parent_id, recipient_ref)
);

create index if not exists wechat_groups_parent_id_idx
  on public.wechat_groups(parent_id);

alter table public.children
  add column if not exists default_wechat_group_id uuid references public.wechat_groups(id) on delete set null;

alter table public.homeworks
  add column if not exists send_to_wechat boolean not null default false;

alter table public.homeworks
  add column if not exists wechat_group_id uuid references public.wechat_groups(id) on delete set null;
