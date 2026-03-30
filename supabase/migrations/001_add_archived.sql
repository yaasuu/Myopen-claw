-- Add is_archived column to tasks table
-- Run this migration against your Supabase project

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Optional: index for filtering archived tasks
CREATE INDEX IF NOT EXISTS idx_tasks_is_archived ON tasks (is_archived);
