-- Enable RLS on wechat_groups
alter table public.wechat_groups enable row level security;

-- Parent can view own wechat groups
create policy "Parent can view own wechat groups"
  on public.wechat_groups
  for select
  to authenticated
  using (parent_id = auth.uid());

-- Parent can insert own wechat groups
create policy "Parent can insert own wechat groups"
  on public.wechat_groups
  for insert
  to authenticated
  with check (parent_id = auth.uid());

-- Parent can update own wechat groups
create policy "Parent can update own wechat groups"
  on public.wechat_groups
  for update
  to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- Parent can delete own wechat groups
create policy "Parent can delete own wechat groups"
  on public.wechat_groups
  for delete
  to authenticated
  using (parent_id = auth.uid());
