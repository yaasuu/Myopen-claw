-- 023_project_milestones_sort_order.sql
-- Adds the missing sort_order column to project_milestones.
-- The dashboard already handles its absence gracefully but this gives proper ordering.

alter table project_milestones
  add column if not exists sort_order int not null default 0;

-- Backfill: order existing rows by created_at within each project
with ranked as (
  select id,
         row_number() over (partition by project_id order by created_at) as rn
  from project_milestones
)
update project_milestones m
   set sort_order = ranked.rn
  from ranked
 where m.id = ranked.id;

comment on column project_milestones.sort_order is 'Display order within a project. Set on insert (count+1) or via manual reorder.';
