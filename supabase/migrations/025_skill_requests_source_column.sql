-- 025_skill_requests_source_column.sql
-- Adds skill_source column to skill_requests if missing (aligns with TS interface).
-- Defensive + idempotent — safe to run any number of times.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'skill_requests'
      and column_name = 'skill_source'
  ) then
    alter table skill_requests
      add column skill_source text not null default 'hermes';
  end if;
end $$;

comment on column skill_requests.skill_source is 'Origin of the requested skill — "hermes" (default) or "manual"';
