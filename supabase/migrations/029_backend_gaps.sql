-- 029_backend_gaps.sql
-- Ensures agents.last_activity and system_status.last_event columns exist
-- and sets up a trigger to keep updated_at fresh on goals.

-- agents.last_activity (may already exist — idempotent)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;

-- system_status.last_event (ensure it exists)
ALTER TABLE system_status ADD COLUMN IF NOT EXISTS last_event TIMESTAMPTZ;

-- Auto-update goals.updated_at on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goals_updated_at ON goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
