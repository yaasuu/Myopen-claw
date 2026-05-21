-- 022_project_status_narrative.sql
-- Adds:
--   1. deliverables_done & criteria_done — parallel string[] arrays tracking which items are checked
--   2. status_narrative + status_narrative_at + status_narrative_by — agent-written project status update
-- All additive; no data migration needed.

alter table projects
  add column if not exists deliverables_done text[]   not null default '{}'::text[],
  add column if not exists criteria_done     text[]   not null default '{}'::text[],
  add column if not exists status_narrative       text,
  add column if not exists status_narrative_at    timestamptz,
  add column if not exists status_narrative_by    text;

comment on column projects.deliverables_done   is 'Texts from deliverables[] that are marked complete';
comment on column projects.criteria_done       is 'Texts from success_criteria[] that are marked complete';
comment on column projects.status_narrative    is 'Short status update written by the project lead agent';
comment on column projects.status_narrative_at is 'When the status narrative was last written';
comment on column projects.status_narrative_by is 'Agent name or short_id that wrote the narrative';
