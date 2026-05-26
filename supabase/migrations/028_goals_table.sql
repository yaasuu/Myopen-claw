-- 028_goals_table.sql
-- Records the goals table which was created manually in Supabase SQL editor.
-- Safe to run — uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT DEFAULT '',
  status         TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  priority       TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  owner          TEXT DEFAULT '',
  due_date       DATE,
  progress       INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may be missing if the table was created manually
ALTER TABLE goals ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS priority    TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'));
ALTER TABLE goals ADD COLUMN IF NOT EXISTS owner       TEXT DEFAULT '';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS due_date    DATE;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS progress    INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);
CREATE INDEX IF NOT EXISTS idx_goals_status  ON goals(status);

-- RLS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "goals_select_anon" ON goals FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "goals_insert_anon" ON goals FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "goals_update_anon" ON goals FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "goals_delete_anon" ON goals FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
