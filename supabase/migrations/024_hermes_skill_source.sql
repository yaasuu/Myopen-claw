-- 024_hermes_skill_source.sql
-- Rebrand: rename "clawhub" → "hermes" as the skill source value.
-- The dashboard already displays both as "Hermes" regardless of the underlying value
-- (formatSource() helper), so this migration is purely a data normalization.

update skills
   set source = 'hermes'
 where source = 'clawhub';

update skill_requests
   set skill_source = 'hermes'
 where skill_source = 'clawhub';

comment on column skills.source is 'Origin of the skill: "hermes" (from Hermes Skill Finder) or "manual" (custom).';
