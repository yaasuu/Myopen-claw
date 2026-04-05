-- =========================================================
-- Migration: 019_heartbeat_architecture.sql
-- Purpose: heartbeat_runs table for per-agent live status
-- =========================================================

create table if not exists heartbeat_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  run_status text not null default 'completed' check (run_status in ('running', 'completed', 'failed', 'skipped')),
  summary text default '',
  detail jsonb default '{}'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  next_due_at timestamptz
);

create index if not exists idx_heartbeat_runs_agent on heartbeat_runs(agent_id);
create index if not exists idx_heartbeat_runs_started on heartbeat_runs(started_at desc);

alter table heartbeat_runs enable row level security;
drop policy if exists "anon_select_heartbeat_runs" on heartbeat_runs;
drop policy if exists "anon_insert_heartbeat_runs" on heartbeat_runs;
drop policy if exists "anon_update_heartbeat_runs" on heartbeat_runs;
create policy "anon_select_heartbeat_runs" on heartbeat_runs for select to anon using (true);
create policy "anon_insert_heartbeat_runs" on heartbeat_runs for insert to anon with check (true);
create policy "anon_update_heartbeat_runs" on heartbeat_runs for update to anon using (true) with check (true);
