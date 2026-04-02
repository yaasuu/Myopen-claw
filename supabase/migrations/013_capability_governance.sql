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

  signal_type text not null check (signal_type in (
    'blocked_task', 'rejected_review', 'returned_for_rework',
    'keyword_mention', 'manual_workaround', 'missing_installed_skill',
    'discussion_signal', 'repeated_failure'
  )),

  source text not null check (source in (
    'task', 'review', 'feed_event', 'session', 'discussion'
  )),
  source_id text default '',
  evidence_text text default '',

  detected_at timestamptz not null default now()
);

create index if not exists idx_capability_gap_evidence_gap
  on public.capability_gap_evidence(gap_id);

create index if not exists idx_capability_gap_evidence_type
  on public.capability_gap_evidence(signal_type);

-- =========================================================
-- 4) capability_improvements (post-install feedback loop)
-- =========================================================
create table if not exists public.capability_improvements (
  id uuid primary key default gen_random_uuid(),
  gap_id uuid not null references public.capability_gaps(id) on delete cascade,
  skill_slug text not null,
  agent_id uuid references public.agents(id) on delete set null,
  measured_at timestamptz default now(),
  days_since_install integer default 0,
  blocker_count_before integer default 0,
  blocker_count_after integer default 0,
  rework_count_before integer default 0,
  rework_count_after integer default 0,
  review_pass_rate_before numeric(5,2) default 0,
  review_pass_rate_after numeric(5,2) default 0,
  improvement_score numeric(5,2) default 0,
  notes text default ''
);

create index if not exists idx_capability_improvements_gap
  on public.capability_improvements(gap_id);

-- =========================================================
-- 5) RLS
-- =========================================================
alter table public.capability_audit_runs enable row level security;
alter table public.capability_gaps enable row level security;
alter table public.capability_gap_evidence enable row level security;
alter table public.capability_improvements enable row level security;

-- capability_audit_runs
create policy "anon_select_audit_runs" on public.capability_audit_runs
  for select to anon using (true);
create policy "anon_insert_audit_runs" on public.capability_audit_runs
  for insert to anon with check (true);
create policy "anon_update_audit_runs" on public.capability_audit_runs
  for update to anon using (true) with check (true);

-- capability_gaps
create policy "anon_select_gaps" on public.capability_gaps
  for select to anon using (true);
create policy "anon_insert_gaps" on public.capability_gaps
  for insert to anon with check (true);
create policy "anon_update_gaps" on public.capability_gaps
  for update to anon using (true) with check (true);

-- capability_gap_evidence
create policy "anon_select_evidence" on public.capability_gap_evidence
  for select to anon using (true);
create policy "anon_insert_evidence" on public.capability_gap_evidence
  for insert to anon with check (true);

-- capability_improvements
create policy "anon_select_improvements" on public.capability_improvements
  for select to anon using (true);
create policy "anon_insert_improvements" on public.capability_improvements
  for insert to anon with check (true);

-- =========================================================
-- 6) Updated-at trigger for capability_gaps
-- =========================================================
create or replace function update_capability_gap_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_capability_gaps_updated on public.capability_gaps;
create trigger trigger_capability_gaps_updated
  before update on public.capability_gaps
  for each row
  execute function update_capability_gap_timestamp();

-- =========================================================
-- 7) Updated-at trigger for capability_audit_runs
-- =========================================================
create or replace function update_audit_run_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_capability_audit_runs_updated on public.capability_audit_runs;
create trigger trigger_capability_audit_runs_updated
  before update on public.capability_audit_runs
  for each row
  execute function update_audit_run_timestamp();

commit;
