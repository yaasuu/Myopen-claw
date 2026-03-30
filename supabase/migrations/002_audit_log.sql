create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);

create index if not exists idx_audit_logs_actor_user_id
  on public.audit_logs (actor_user_id);

create index if not exists idx_audit_logs_action
  on public.audit_logs (action);

create index if not exists idx_audit_logs_target
  on public.audit_logs (target_type, target_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_read_authenticated" on public.audit_logs;
drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;

create policy "audit_logs_read_authenticated"
on public.audit_logs
for select
to authenticated
using (true);

create policy "audit_logs_insert_authenticated"
on public.audit_logs
for insert
to authenticated
with check (true);
