-- =========================================================
-- Migration: 016_learning_hub_tables.sql
-- Purpose: Create missing tables for Learning Hub feature
-- Date:    2026-04-04
-- Safety:  Idempotent (IF NOT EXISTS everywhere possible)
-- =========================================================
--
-- Confirmed ALREADY EXISTS (DO NOT touch):
--   tasks, agents, feed_events, daily_notes, skill_requests,
--   task_reviews, tasks_status_check, departments,
--   capability_gaps, workspace_files, task_comments
--
-- This migration creates ONLY the MISSING tables:
--   1. section_a_lessons          (Learning Hub core)
--   2. section_b_system_updates   (Learning Hub core)
--   3. gap_evidence               (Optional governance)
--   4. audit_runs                 (Optional governance)
-- =========================================================

begin;

-- ──────────────────────────────────────────────────────────
-- SECTION A: Learning Hub required tables
-- These are needed for Lessons tab and Updates tab.
-- ──────────────────────────────────────────────────────────

-- A1. lessons — Durable learning log for system insights
create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),

  -- Identification
  title text not null,
  lesson_statement text default '',
  pattern text default '',

  -- Scope
  affected_agents text[] default '{}',
  department text default '',

  -- Classification
  source_type text default 'blocker_analysis'
    check (source_type in (
      'blocker_analysis',
      'review_feedback',
      'agent_request',
      'system_audit',
      'manual'
    )),
  source_refs text[] default '{}',
  pattern_type text default 'recurring_blocker',
  proposed_fix_type text default 'prompt_update'
    check (proposed_fix_type in (
      'prompt_update',
      'sop_addition',
      'workflow_change',
      'skill_addition',
      'routing_change',
      'template_update',
      'manual_intervention'
    )),
  proposed_fix text default '',
  confidence text default 'medium'
    check (confidence in ('low', 'medium', 'high')),

  -- Lifecycle
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'applied', 'rejected')),
  approved_by text default '',
  date_detected timestamptz default now(),
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for lessons
create index if not exists idx_lessons_status on lessons(status);
create index if not exists idx_lessons_date_detected on lessons(date_detected desc);
create index if not exists idx_lessons_source_type on lessons(source_type);

-- RLS for lessons
alter table lessons enable row level security;
create policy "anon_select_lessons" on lessons for select to anon using (true);
create policy "anon_insert_lessons" on lessons for insert to anon with check (true);
create policy "anon_update_lessons" on lessons for update to anon using (true) with check (true);

-- A2. system_updates — Audit log for applied improvements
create table if not exists system_updates (
  id uuid primary key default gen_random_uuid(),

  -- What changed
  type text not null
    check (type in (
      'skill_installed',
      'prompt_updated',
      'sop_added',
      'workflow_changed',
      'routing_adjusted',
      'template_improved'
    )),
  title text not null,
  description text default '',

  -- Scope
  affected_entities text[] default '{}',

  -- Traceability back to source
  source_lesson_id uuid,
  source_approval_id uuid,

  -- Timing
  applied_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Foreign keys (best-effort — only if referenced tables exist)
-- These are deferred via DO blocks so the migration never fails
-- if the referenced table doesn't have the expected column yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_name = 'lessons'
  ) then
    begin
      execute 'alter table system_updates
        add constraint fk_system_updates_lesson
        foreign key (source_lesson_id) references lessons(id) on delete set null';
    exception when others then null;
    end;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_name = 'skill_requests'
  ) then
    begin
      execute 'alter table system_updates
        add constraint fk_system_updates_approval
        foreign key (source_approval_id) references skill_requests(id) on delete set null';
    exception when others then null;
    end;
  end if;
end $$;

-- Indexes for system_updates
create index if not exists idx_system_updates_type on system_updates(type);
create index if not exists idx_system_updates_applied_at on system_updates(applied_at desc);

-- RLS for system_updates
alter table system_updates enable row level security;
create policy "anon_select_system_updates" on system_updates for select to anon using (true);
create policy "anon_insert_system_updates" on system_updates for insert to anon with check (true);

-- ──────────────────────────────────────────────────────────
-- SECTION B: Optional governance tables
-- Not required for the Learning Hub UI to function, but
-- support deeper capability-gap auditing and audit trails.
-- ──────────────────────────────────────────────────────────

-- B1. gap_evidence — Evidence backing for detected skill/capability gaps
create table if not exists gap_evidence (
  id uuid primary key default gen_random_uuid(),

  -- Link to the detected gap
  gap_id uuid not null, -- references capability_gaps(id) if column exists
  evidence_type text default 'task_failure'
    check (evidence_type in (
      'task_failure',
      'review_comment',
      'agent_log',
      'feed_event'
    )),
  evidence_ref text default '',
  summary text default '',

  -- Timestamp
  detected_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Best-effort FK to capability_gaps
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_name = 'capability_gaps'
  ) then
    begin
      execute 'alter table gap_evidence
        add constraint fk_gap_evidence_gap
        foreign key (gap_id) references capability_gaps(id) on delete cascade';
    exception when others then null;
    end;
  end if;
end $$;

create index if not exists idx_gap_evidence_gap_id on gap_evidence(gap_id);
create index if not exists idx_gap_evidence_detected_at on gap_evidence(detected_at desc);

alter table gap_evidence enable row level security;
create policy "anon_select_gap_evidence" on gap_evidence for select to anon using (true);
create policy "anon_insert_gap_evidence" on gap_evidence for insert to anon with check (true);

-- B2. audit_runs — Log of automated audit executions
create table if not exists audit_runs (
  id uuid primary key default gen_random_uuid(),

  -- What was audited
  audit_type text not null default 'capability_gap'
    check (audit_type in (
      'capability_gap',
      'feed_integrity',
      'task_consistency',
      'lesson_generation'
    )),

  -- Results
  status text not null default 'completed'
    check (status in ('running', 'completed', 'failed', 'partial')),
  findings_count int default 0,
  summary text default '',
  detail jsonb default '{}'::jsonb,

  -- Timing
  started_at timestamptz default now(),
  completed_at timestamptz,
  next_due_at timestamptz
);

create index if not exists idx_audit_runs_type on audit_runs(audit_type);
create index if not exists idx_audit_runs_status on audit_runs(status);
create index if not exists idx_audit_runs_started_at on audit_runs(started_at desc);

alter table audit_runs enable row level security;
create policy "anon_select_audit_runs" on audit_runs for select to anon using (true);
create policy "anon_insert_audit_runs" on audit_runs for insert to anon with check (true);
create policy "anon_update_audit_runs" on audit_runs for update to anon using (true) with check (true);

commit;

-- =========================================================
-- Post-migration verification check
-- =========================================================
-- Run after migration to confirm all 4 tables exist:
--   select table_name from information_schema.tables
--   where table_schema = 'public'
--     and table_name in ('lessons', 'system_updates', 'gap_evidence', 'audit_runs')
--   order by table_name;
