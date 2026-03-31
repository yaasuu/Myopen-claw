-- Phase 8D: Task Comments
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'Yas',
  author_role TEXT NOT NULL DEFAULT 'ceo' CHECK (author_role IN ('ceo', 'agent', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created ON task_comments(created_at);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_comments" ON task_comments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_comments" ON task_comments FOR INSERT TO anon WITH CHECK (true);
