-- 015_learning_hub.sql
-- Adds tables for the Learning Hub: skill_requests and lessons

-- 1. Skill Requests
create table if not exists skill_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  requested_by text not null default 'System',
  affected_agent text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'installed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table skill_requests enable row level security;
create policy "anon_select_skill_requests" on skill_requests for select to anon using (true);
create policy "anon_insert_skill_requests" on skill_requests for insert to anon with check (true);
create policy "anon_update_skill_requests" on skill_requests for update to anon using (true) with check (true);

-- 2. Lessons
create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pattern text,
  affected_agents text[],
  lesson_statement text,
  proposed_fix text,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'applied', 'rejected')),
  source_ref text,
  date_detected timestamptz default now(),
  approved_by text,
  applied_at timestamptz
);
alter table lessons enable row level security;
create policy "anon_select_lessons" on lessons for select to anon using (true);
create policy "anon_insert_lessons" on lessons for insert to anon with check (true);
create policy "anon_update_lessons" on lessons for update to anon using (true) with check (true);

-- 3. System Updates (Audit Log for Learning)
create table if not exists system_updates (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('skill_installed', 'prompt_updated', 'sop_added', 'workflow_changed')),
  title text not null,
  description text,
  affected_entities text[],
  source_lesson_id uuid references lessons(id),
  source_approval_id uuid references skill_requests(id),
  applied_at timestamptz default now()
);
alter table system_updates enable row level security;
create policy "anon_select_system_updates" on system_updates for select to anon using (true);
create policy "anon_insert_system_updates" on system_updates for insert to anon with check (true);
