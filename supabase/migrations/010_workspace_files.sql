-- Phase 9B: Workspace Files
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS workspace_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type TEXT NOT NULL CHECK (unit_type IN ('orchestrator', 'department', 'agent', 'specialist')),
  unit_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(unit_type, unit_id, file_name)
);

CREATE INDEX IF NOT EXISTS idx_workspace_files_unit ON workspace_files(unit_type, unit_id);
CREATE INDEX IF NOT EXISTS idx_workspace_files_name ON workspace_files(file_name);

GRANT SELECT, INSERT, UPDATE ON workspace_files TO anon;

ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_workspace_files" ON workspace_files FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_workspace_files" ON workspace_files FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_workspace_files" ON workspace_files FOR UPDATE TO anon USING (true) WITH CHECK (true);
