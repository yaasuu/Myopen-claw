-- Phase 6E: Knowledge Management System
-- Run this in Supabase SQL Editor

-- 1. Daily notes
CREATE TABLE IF NOT EXISTS daily_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL UNIQUE, -- "2026-03-30"
  summary TEXT DEFAULT '',
  events_reviewed INT DEFAULT 0,
  decisions TEXT[] DEFAULT '{}',
  blockers TEXT[] DEFAULT '{}',
  priorities_tomorrow TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Knowledge entries (PARA model)
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('project', 'area', 'resource', 'archive')),
  tags TEXT[] DEFAULT '{}',
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  related_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  related_department_id UUID,
  source TEXT DEFAULT 'manual', -- 'manual', 'auto-daily', 'auto-review'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON daily_notes(date);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge_entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_updated ON knowledge_entries(updated_at DESC);

-- RLS
ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_daily_notes" ON daily_notes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_daily_notes" ON daily_notes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_daily_notes" ON daily_notes FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_knowledge" ON knowledge_entries FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_knowledge" ON knowledge_entries FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_knowledge" ON knowledge_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);
