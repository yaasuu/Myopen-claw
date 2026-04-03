-- Migration 014: Extend daily_notes for full Daily Team Sync (A-G)
-- Adds JSONB fields to store structured sync reports

ALTER TABLE daily_notes
  ADD COLUMN IF NOT EXISTS agent_updates JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cross_team_summary JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skill_gaps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS issues_list TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS yas_decisions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sync_type TEXT DEFAULT 'basic' CHECK (sync_type IN ('basic', 'full_sync'));

CREATE INDEX IF NOT EXISTS idx_daily_notes_sync_type ON daily_notes(sync_type);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON daily_notes TO anon;
