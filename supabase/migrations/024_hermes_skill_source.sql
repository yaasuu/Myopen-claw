-- 024_hermes_skill_source.sql
-- Rebrand: rename "clawhub" → "hermes" as the skill source value.
-- The dashboard already displays both as "Hermes" regardless of the underlying value
-- (formatSource() helper), so this migration is purely a data normalization.
--
-- Defensive: only updates skill_requests.skill_source if that column exists,
-- since the TS interface predates the schema in some envs.

update skills
   set source = 'hermes'
 where source = 'clawhub';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'skill_requests'
      and column_name = 'skill_source'
  ) then
    update skill_requests
       set skill_source = 'hermes'
     where skill_source = 'clawhub';
  end if;
end $$;

comment on column skills.source is 'Origin of the skill: "hermes" (from Hermes Skill Finder) or "manual" (custom).';
