-- =========================================================
-- Migration: 018_fix_workforce_schema.sql
-- Purpose: Fix missing columns blocking workforce/org-chart
-- Date:    2026-04-04
-- Safety:  Idempotent (ADD COLUMN IF NOT EXISTS)
-- =========================================================
--
-- WORKFORCE PAGE requires these columns:
--   departments: domain (text), agent_count (int)
--   specialist_types: spawn_count (int), last_spawned (timestamptz)
-- =========================================================

begin;

-- Fix departments: add missing columns
if not exists (select 1 from information_schema.columns where table_name = 'departments' and column_name = 'domain') then
  alter table departments add column domain text default '';
end if;

if not exists (select 1 from information_schema.columns where table_name = 'departments' and column_name = 'agent_count') then
  alter table departments add column agent_count int default 0;
end if;

-- Fix specialist_types: add missing columns
if not exists (select 1 from information_schema.columns where table_name = 'specialist_types' and column_name = 'spawn_count') then
  alter table specialist_types add column spawn_count int default 0;
end if;

if not exists (select 1 from information_schema.columns where table_name = 'specialist_types' and column_name = 'last_spawned') then
  alter table specialist_types add column column last_spawned timestamptz;
end if;

commit;
