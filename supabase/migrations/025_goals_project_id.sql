-- 025_goals_project_id.sql
-- Goals are now scoped to projects — project_id is required in the UI
-- (nullable in DB to preserve existing rows)

ALTER TABLE goals ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);
