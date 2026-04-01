-- Phase 10E.3: Task Reviews
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS task_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected', 'returned_for_rework')),
  notes TEXT DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT 'Yas',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_reviews_task ON task_reviews(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reviews_created ON task_reviews(created_at DESC);

GRANT SELECT, INSERT ON task_reviews TO anon;

ALTER TABLE task_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_reviews" ON task_reviews FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_reviews" ON task_reviews FOR INSERT TO anon WITH CHECK (true);
