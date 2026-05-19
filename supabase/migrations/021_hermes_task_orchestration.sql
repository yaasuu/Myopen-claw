-- Phase 21: Hermes task orchestration
-- Adds clean dispatch -> submit -> review -> approve workflow

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (
    status in (
      'pending',
      'dispatched',
      'in-progress',
      'submitted',
      'in-review',
      'approved',
      'blocked',
      'rework',
      'done'
    )
  );

alter table public.tasks
  add column if not exists owner_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists handled_by_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending', 'submitted', 'in_review', 'approved', 'rejected', 'returned_for_rework')),
  add column if not exists review_notes text not null default '',
  add column if not exists reviewed_by text,
  add column if not exists requires_yas_approval boolean not null default false,
  add column if not exists dispatch_notes text not null default '',
  add column if not exists dispatched_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

create index if not exists idx_tasks_owner_agent on public.tasks(owner_agent_id);
create index if not exists idx_tasks_handled_by_agent on public.tasks(handled_by_agent_id);
create index if not exists idx_tasks_review_status on public.tasks(review_status);
create index if not exists idx_tasks_requires_yas_approval on public.tasks(requires_yas_approval);

alter table public.task_reviews
  add column if not exists review_stage text not null default 'orchestrator'
    check (review_stage in ('worker_submission', 'orchestrator', 'yas')),
  add column if not exists evidence text not null default '',
  add column if not exists risk_notes text not null default '',
  add column if not exists action_required text not null default '';

create index if not exists idx_task_reviews_stage on public.task_reviews(review_stage);

comment on column public.tasks.owner_agent_id is 'Primary worker agent selected by Hermes orchestrator.';
comment on column public.tasks.handled_by_agent_id is 'Agent currently executing or last executing the task.';
comment on column public.tasks.review_status is 'Review lifecycle: pending, submitted, in_review, approved, rejected, returned_for_rework.';
comment on column public.tasks.requires_yas_approval is 'True when final approval must come from Yas.';
comment on column public.task_reviews.review_stage is 'Whether the review record came from worker submission, orchestrator review, or Yas approval.';