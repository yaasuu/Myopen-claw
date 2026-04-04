-- Migration 015: Schema Harmonization for Myopen-claw
-- Adds missing columns to match frontend expectations

-- 1. Agents Table Updates
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS short_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🤖',
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Tasks Status Enum Alignment
-- Add 'in-review' type if not present (Postgres uses text, so we just ensure logic handles it)
-- We will update any 'todo' tasks to 'pending' for consistency
UPDATE tasks SET status = 'pending' WHERE status = 'todo';

-- 3. Feed Events Table (if not exists)
CREATE TABLE IF NOT EXISTS feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  summary TEXT NOT NULL,
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  related_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_events_created ON feed_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_agent ON feed_events(related_agent_id);

-- RLS for Feed Events
ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_feed" ON feed_events FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_feed" ON feed_events FOR INSERT TO anon WITH CHECK (true);
