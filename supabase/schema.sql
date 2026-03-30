-- Yas Claw Mission Control — Supabase Schema
-- Run this in Supabase SQL Editor: https://app.supabase.com → Project → SQL Editor

-- 1. Agents
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_id text unique not null,
  emoji text default '🤖',
  description text default '',
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  domain text default '',
  task_count int default 0,
  last_activity timestamptz,
  created_at timestamptz default now()
);

-- 2. Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  status text not null default 'pending' check (status in ('pending', 'in-progress', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  assigned_agent_id uuid references agents(id) on delete set null,
  blocker text,
  owner text default 'Yas',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Feed Events
create table if not exists feed_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'task_created', 'task_updated', 'task_completed',
    'agent_routed', 'agent_paused', 'agent_resumed',
    'system_alert', 'blocker_detected', 'blocker_resolved'
  )),
  source text not null default 'system',
  summary text not null,
  related_task_id uuid references tasks(id) on delete set null,
  related_agent_id uuid references agents(id) on delete set null,
  created_at timestamptz default now()
);

-- 4. Org Nodes
create table if not exists org_nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  emoji text default '🤖',
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  parent_id uuid references org_nodes(id) on delete set null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 5. System Status
create table if not exists system_status (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'healthy' check (status in ('healthy', 'degraded', 'down')),
  active_agents int default 0,
  open_tasks int default 0,
  blocked_tasks int default 0,
  last_event timestamptz,
  checked_at timestamptz default now()
);

-- Indexes
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_assigned_agent on tasks(assigned_agent_id);
create index if not exists idx_feed_events_created_at on feed_events(created_at desc);
create index if not exists idx_feed_events_type on feed_events(event_type);
create index if not exists idx_org_nodes_parent on org_nodes(parent_id);

-- Seed data: Root org node
insert into org_nodes (name, role, emoji, status, sort_order) values
  ('Yas Claw', 'System Operator / AI Chief of Staff', '🦀', 'active', 0)
on conflict do nothing;

-- Seed data: Agents
insert into agents (name, short_id, emoji, description, status, domain) values
  ('Export-Growth Agent', 'export-growth', '📦', 'Handles export opportunities, leads, and buyer follow-up', 'active', 'Export execution, lead generation, buyer follow-up'),
  ('Ops-Improvement Agent', 'ops-improvement', '⚙️', 'Handles workflows, process improvement, and routines', 'active', 'Workflows, process improvement, routines'),
  ('Architecture-Systems Agent', 'architecture-systems', '🏗️', 'Handles platform design, data modeling, and system architecture', 'paused', 'Platform design, data modeling, system architecture')
on conflict (short_id) do nothing;

-- Seed data: System status
insert into system_status (status, active_agents, open_tasks, blocked_tasks) values
  ('healthy', 0, 0, 0)
on conflict do nothing;

-- RLS Policies: allow anon read access
alter table agents enable row level security;
alter table tasks enable row level security;
alter table feed_events enable row level security;
alter table org_nodes enable row level security;
alter table system_status enable row level security;

drop policy if exists "anon_select_agents" on agents;
drop policy if exists "anon_select_tasks" on tasks;
drop policy if exists "anon_select_feed_events" on feed_events;
drop policy if exists "anon_select_org_nodes" on org_nodes;
drop policy if exists "anon_select_system_status" on system_status;
drop policy if exists "anon_insert_tasks" on tasks;
drop policy if exists "anon_update_tasks" on tasks;
drop policy if exists "anon_insert_feed_events" on feed_events;

create policy "anon_select_agents" on agents for select to anon using (true);
create policy "anon_select_tasks" on tasks for select to anon using (true);
create policy "anon_select_feed_events" on feed_events for select to anon using (true);
create policy "anon_select_org_nodes" on org_nodes for select to anon using (true);
create policy "anon_select_system_status" on system_status for select to anon using (true);

create policy "anon_insert_tasks" on tasks for insert to anon with check (true);
create policy "anon_update_tasks" on tasks for update to anon using (true) with check (true);

create policy "anon_insert_feed_events" on feed_events for insert to anon with check (true);
