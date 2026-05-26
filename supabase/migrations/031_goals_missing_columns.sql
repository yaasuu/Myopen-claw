-- 031_goals_missing_columns.sql
-- Adds columns the goals page UI reads that weren't in the original migration

ALTER TABLE goals ADD COLUMN IF NOT EXISTS parent_goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);
