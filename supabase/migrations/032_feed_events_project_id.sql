-- 032_feed_events_project_id.sql
-- Adds project_id to feed_events so the project Activity tab can show
-- project-level events (governance runs, portfolio reviews, etc.)
-- that don't have a related_task_id.

ALTER TABLE feed_events
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_events_project ON feed_events(project_id);
