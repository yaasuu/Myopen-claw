-- Add columns for daily sync report to daily_notes
-- These mirror the report structure in /api/cron/daily-sync

ALTER TABLE daily_notes
  ADD COLUMN IF NOT EXISTS wins text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agent_updates jsonb,
  ADD COLUMN IF NOT EXISTS cross_team_summary jsonb,
  ADD COLUMN IF NOT EXISTS skill_gaps jsonb,
  ADD COLUMN IF NOT EXISTS issues_list text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS yas_decisions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sync_type text;

-- Comments (optional but helpful)
COMMENT ON COLUMN daily_notes.wins IS 'Top completed task titles for the day (array of text)';
COMMENT ON COLUMN daily_notes.agent_updates IS 'Agent performance summary for the day (jsonb array of objects)';
COMMENT ON COLUMN daily_notes.cross_team_summary IS 'Coordination metrics (jsonb object)';
COMMENT ON COLUMN daily_notes.skill_gaps IS 'Detected capability gaps (jsonb array)';
COMMENT ON COLUMN daily_notes.issues_list IS 'Detailed blocker list with root cause (array of text)';
COMMENT ON COLUMN daily_notes.yas_decisions IS 'Decisions requiring Yas attention (array of text)';
COMMENT ON COLUMN daily_notes.sync_type IS 'Type of sync: full_sync or delta';
