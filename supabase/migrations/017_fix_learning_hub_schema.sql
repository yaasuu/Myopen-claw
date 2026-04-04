-- =========================================================
-- Migration: 017_fix_learning_hub_schema.sql
-- Purpose: Fix missing columns in skill_requests, capability_gaps
--          and CREATE lessons + system_updates tables
-- Date:    2026-04-04
-- Safety:  Idempotent (ADD COLUMN IF NOT EXISTS, CREATE IF NOT EXISTS)
-- =========================================================
--
-- ROOT CAUSE:
--   skill_requests exists but is missing: title, description, affected_agent
--   capability_gaps exists but is missing: status, title, description, domain, gap_type
--   lessons table does NOT exist
--   system_updates table does NOT exist
-- =========================================================

begin;

-- ──────────────────────────────────────────────────────────
-- FIX 1: skill_requests — add missing columns
-- The table exists but lacks columns required by the UI
-- ──────────────────────────────────────────────────────────

do $$
begin
  -- title (required by UI queries)
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'skill_requests' and column_name = 'title'
  ) then
    -- If table has a 'name' column, rename it to 'title'
    if exists (
      select 1 from information_schema.columns 
      where table_name = 'skill_requests' and column_name = 'name'
    ) then
      execute 'alter table skill_requests rename column name to title';
    else
      -- Add new title column
      alter table skill_requests add column title text default '';
    end if;
  end if;

  -- description
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'skill_requests' and column_name = 'description'
  ) then
    alter table skill_requests add column description text default '';
  end if;

  -- affected_agent
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'skill_requests' and column_name = 'affected_agent'
  ) then
    alter table skill_requests add column affected_agent text default '';
  end if;

  -- short_id (for consistency with other tables)
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'skill_requests' and column_name = 'short_id'
  ) then
    alter table skill_requests add column short_id text default '';
  end if;
end $$;

-- Make sure requested_by has a default (may be NULL from old schema)
alter table skill_requests alter column requested_by set default 'System';


-- ──────────────────────────────────────────────────────────
-- FIX 2: capability_gaps — add missing columns
-- ──────────────────────────────────────────────────────────

do $$
begin
  -- status
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'capability_gaps' and column_name = 'status'
  ) then
    alter table capability_gaps add column status text default 'detected';
  end if;

  -- title
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'capability_gaps' and column_name = 'title'
  ) then
    alter table capability_gaps add column title text default '';
  end if;

  -- description
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'capability_gaps' and column_name = 'description'
  ) then
    alter table capability_gaps add column description text default '';
  end if;

  -- domain
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'capability_gaps' and column_name = 'domain'
  ) then
    alter table capability_gaps add column domain text default '';
  end if;

  -- gap_type
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'capability_gaps' and column_name = 'gap_type'
  ) then
    alter table capability_gaps add column gap_type text default 'skill_gap';
  end if;
end $$;


-- ──────────────────────────────────────────────────────────
-- CREATE 3: lessons table (did not exist)
-- ──────────────────────────────────────────────────────────

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  lesson_statement text default '',
  pattern text default '',
  affected_agents text[] default '{}',
  department text default '',
  source_type text default 'blocker_analysis',
  source_refs text[] default '{}',
  pattern_type text default 'recurring_blocker',
  proposed_fix_type text default 'prompt_update',
  proposed_fix text default '',
  confidence text default 'medium',
  status text not null default 'draft',
  approved_by text default '',
  date_detected timestamptz default now(),
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_lessons_status on lessons(status);
create index if not exists idx_lessons_date_detected on lessons(date_detected desc);

alter table lessons enable row level security;
drop policy if exists "anon_select_lessons" on lessons;
drop policy if exists "anon_insert_lessons" on lessons;
drop policy if exists "anon_update_lessons" on lessons;
create policy "anon_select_lessons" on lessons for select to anon using (true);
create policy "anon_insert_lessons" on lessons for insert to anon with check (true);
create policy "anon_update_lessons" on lessons for update to anon using (true) with check (true);


-- ──────────────────────────────────────────────────────────
-- CREATE 4: system_updates table (did not exist)
-- ──────────────────────────────────────────────────────────

create table if not exists system_updates (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  description text default '',
  affected_entities text[] default '{}',
  source_lesson_id uuid,
  source_approval_id uuid,
  applied_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Best-effort FKs
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'lessons') then
    begin
      execute 'alter table system_updates add constraint fk_system_updates_lesson foreign key (source_lesson_id) references lessons(id) on delete set null';
    exception when others then null;
    end;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'skill_requests') then
    begin
      execute 'alter table system_updates add constraint fk_system_updates_approval foreign key (source_approval_id) references skill_requests(id) on delete set null';
    exception when others then null;
    end;
  end if;
end $$;

create index if not exists idx_system_updates_type on system_updates(type);
create index if not exists idx_system_updates_applied_at on system_updates(applied_at desc);

alter table system_updates enable row level security;
drop policy if exists "anon_select_system_updates" on system_updates;
drop policy if exists "anon_insert_system_updates" on system_updates;
create policy "anon_select_system_updates" on system_updates for select to anon using (true);
create policy "anon_insert_system_updates" on system_updates for insert to anon with check (true);


-- ──────────────────────────────────────────────────────────
-- FIX 5: gap_evidence (depends on capability_gaps schema fix above)
-- ──────────────────────────────────────────────────────────

create table if not exists gap_evidence (
  id uuid primary key default gen_random_uuid(),
  gap_id uuid not null,
  evidence_type text default 'task_failure',
  evidence_ref text default '',
  summary text default '',
  detected_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_gap_evidence_gap_id on gap_evidence(gap_id);
create index if not exists idx_gap_evidence_detected_at on gap_evidence(detected_at desc);

alter table gap_evidence enable row level security;
drop policy if exists "anon_select_gap_evidence" on gap_evidence;
drop policy if exists "anon_insert_gap_evidence" on gap_evidence;
create policy "anon_select_gap_evidence" on gap_evidence for select to anon using (true);
create policy "anon_insert_gap_evidence" on gap_evidence for insert to anon with check (true);


-- ──────────────────────────────────────────────────────────
-- FIX 6: audit_runs (optional governance)
-- ──────────────────────────────────────────────────────────

create table if not exists audit_runs (
  id uuid primary key default gen_random_uuid(),
  audit_type text not null default 'capability_gap',
  status text not null default 'completed',
  findings_count int default 0,
  summary text default '',
  detail jsonb default '{}'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  next_due_at timestamptz
);

create index if not exists idx_audit_runs_type on audit_runs(audit_type);
create index if not exists idx_audit_runs_status on audit_runs(status);
create index if not exists idx_audit_runs_started_at on audit_runs(started_at desc);

alter table audit_runs enable row level security;
drop policy if exists "anon_select_audit_runs" on audit_runs;
drop policy if exists "anon_insert_audit_runs" on audit_runs;
drop policy if exists "anon_update_audit_runs" on audit_runs;
create policy "anon_select_audit_runs" on audit_runs for select to anon using (true);
create policy "anon_insert_audit_runs" on audit_runs for insert to anon with check (true);
create policy "anon_update_audit_runs" on audit_runs for update to anon using (true) with check (true);

commit;
