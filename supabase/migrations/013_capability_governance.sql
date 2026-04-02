-- 013_capability_governance.sql
-- Yas Claw Capability Governance
-- Nightly audit + evidence-based skill gap recommendations

begin;

-- =========================================================
-- 1) capability_audit_runs
-- =========================================================
create table if not exists public.capability_audit_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  run_started_at timestamptz not null default now(),
  run_completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  total_agents_scanned integer not null default 0,
  total_tasks_scanned integer not null default 0,
  total_signals_detected integer not null default 0,
  total_gaps_created integer not null default 0,
  total_high_confidence integer not null default 0,
  total_medium_confidence integer not null default 0,
  total_low_confidence integer not null default 0,
  summary text default '',
  created_by text not null default 'Yas Claw',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_date)
);

create index if not exists idx_capability_audit_runs_run_date
  on public.capability_audit_runs(run_date desc);

-- =========================================================
-- 2) capability_gaps
-- =========================================================
create table if not exists public.capability_gaps (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid references public.capability_audit_runs(id) on delete set null,
  agent_id uuid not null references public.agents(id) on delete cascade,

  -- what gap was detected
  missing_skill_slug text,
  missing_skill_name text not null,
  gap_category text not null
    check (gap_category in (
      'missing_skill',
      'wrong_assignment',
      'unclear_scope',
      'dependency_blocker',
      'missing_process',
      'approval_delay'
    )),

  -- scoring / decision fields
  confidence_level text not null
    check (confidence_level in ('low', 'medium', 'high')),
  urgency_level text not null
    check (urgency_level in ('low', 'medium', 'high')),
  composite_score numeric(4,2) not null default 0.00,
  evidence_count integer not null default 0,

  -- reasoning
  why_flagged text not null default '',
  recommended_action text not null default 'monitor',
  owner_route text not null default 'yas-claw'
    check (owner_route in ('yas-claw', 'data-analyst', 'architecture-systems', 'ceo')),

  -- governance state
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'monitored', 'resolved')),
  reviewed_by text,
  reviewed_at timestamptz,
  resolution_notes text default '',

  -- lifecycle
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capability_gaps_agent
  on public.capability_gaps(agent_id);

create index if not exists idx_capability_gaps_review_status
  on public.capability_gaps(review_status);

create index if not exists idx_capability_gaps_confidence
  on public.capability_gaps(confidence_level);

create index if not exists idx_capability_gaps_urgency
  on public.capability_gaps(urgency_level);

create index if not exists idx_capability_gaps_last_seen
  on public.capability_gaps(last_seen_at desc);

create index if not exists idx_capability_gaps_audit_run
  on public.capability_gaps(audit_run_id);

-- de-duplication: one open gap per agent+skill+category
create unique index if not exists uq_capability_gaps_open_gap
  on public.capability_gaps(agent_id, coalesce(missing_skill_slug, missing_skill_name), gap_category, review_status)
  where review_status in ('pending', 'approved', 'monitored');

-- =========================================================
-- 3) capability_gap_evidence
-- =========================================================
create table if not exists public.capability_gap_evidence (
  id uuid primary key default gen_random_uuid(),
  gap_id uuid not null references public.capability_gaps(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,

  evidence_type text not null
    check (evidence_type in (
      'task_keyword',
      'blocked_task',
      'rejected_review',
      'returned_for_rework',
      'discussion_signal',
      'proposal_signal',
      'approval_signal',
      'tool_mention',
      'manual_workaround',
      'repeat_assignment',
      'live_feed_event'
    )),

  source_table text,
  source_id text,
  source_label text default '',
  source_excerpt text default '',

  weight numeric(4,2) not null default 1.00,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_capability_gap_evidence_gap
  on public.capability_gap_evidence(gap_id);

create index if not exists idx_capability_gap_evidence_agent
  on public.capability_gap_evidence(agent_id);

create index if not exists idx_capability_gap_evidence_type
  on public.capability_gap_evidence(evidence_type);

-- =========================================================
-- 4) updated_at triggers
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_capability_audit_runs_updated_at on public.capability_audit_runs;
create trigger trg_capability_audit_runs_updated_at
  before update on public.capability_audit_runs
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_capability_gaps_updated_at on public.capability_gaps;
create trigger trg_capability_gaps_updated_at
  before update on public.capability_gaps
  for each row
  execute function public.set_updated_at();

-- =========================================================
-- 5) RLS
-- =========================================================
alter table public.capability_audit_runs enable row level security;
alter table public.capability_gaps enable row level security;
alter table public.capability_gap_evidence enable row level security;

-- drop old policies if rerun
drop policy if exists "anon_select_capability_audit_runs" on public.capability_audit_runs;
drop policy if exists "anon_insert_capability_audit_runs" on public.capability_audit_runs;
drop policy if exists "anon_update_capability_audit_runs" on public.capability_audit_runs;

drop policy if exists "anon_select_capability_gaps" on public.capability_gaps;
drop policy if exists "anon_insert_capability_gaps" on public.capability_gaps;
drop policy if exists "anon_update_capability_gaps" on public.capability_gaps;

drop policy if exists "anon_select_capability_gap_evidence" on public.capability_gap_evidence;
drop policy if exists "anon_insert_capability_gap_evidence" on public.capability_gap_evidence;
drop policy if exists "anon_update_capability_gap_evidence" on public.capability_gap_evidence;

create policy "anon_select_capability_audit_runs"
  on public.capability_audit_runs for select to anon using (true);
create policy "anon_insert_capability_audit_runs"
  on public.capability_audit_runs for insert to anon with check (true);
create policy "anon_update_capability_audit_runs"
  on public.capability_audit_runs for update to anon using (true) with check (true);

create policy "anon_select_capability_gaps"
  on public.capability_gaps for select to anon using (true);
create policy "anon_insert_capability_gaps"
  on public.capability_gaps for insert to anon with check (true);
create policy "anon_update_capability_gaps"
  on public.capability_gaps for update to anon using (true) with check (true);

create policy "anon_select_capability_gap_evidence"
  on public.capability_gap_evidence for select to anon using (true);
create policy "anon_insert_capability_gap_evidence"
  on public.capability_gap_evidence for insert to anon with check (true);
create policy "anon_update_capability_gap_evidence"
  on public.capability_gap_evidence for update to anon using (true) with check (true);

grant select, insert, update on public.capability_audit_runs to anon;
grant select, insert, update on public.capability_gaps to anon;
grant select, insert, update on public.capability_gap_evidence to anon;

-- =========================================================
-- 6) feed_events support for capability governance events
-- =========================================================
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
    and table_name = 'feed_events'
  ) then
    begin
      alter table public.feed_events drop constraint if exists feed_events_event_type_check;
    exception when others then
      null;
    end;

    alter table public.feed_events
      add constraint feed_events_event_type_check
      check (event_type in (
        'task_created','task_updated','task_completed','agent_routed','agent_paused','agent_resumed','agent_hired',
        'system_alert','blocker_detected','blocker_resolved','governance_daily_run','governance_weekly_run',
        'governance_monthly_run','governance_quarterly_run','autonomy_state_changed','governance_issue_detected',
        'department_created','department_updated','department_paused','department_resumed','specialist_spawned',
        'specialist_completed','specialist_terminated','specialist_promoted_recommended','portfolio_review_run',
        'portfolio_risk_detected','portfolio_rebalance_triggered','skill_requested','skill_approved','skill_rejected',
        'skill_installed','skill_scan_clean','skill_scan_flagged','agent_decision','agent_discussion','agent_routing',
        'plan_created','plan_updated',
        'discussion_started','discussion_summary_logged','finding_logged','proposal_created',
        'approval_requested','approval_granted','approval_rejected','task_returned_for_rework',
        'capability_gap_detected','capability_review_requested','skill_recommendation_approved',
        'skill_recommendation_rejected','capability_gap_resolved'
      ));
  end if;
end $$;

commit;
