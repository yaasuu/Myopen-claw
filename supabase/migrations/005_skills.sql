-- Phase 6D: Skills System
-- Run this in Supabase SQL Editor

-- 1. Skills registry
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'clawhub',
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  installed_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Agent skills (many-to-many)
CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ DEFAULT now(),
  month_installed TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  UNIQUE(agent_id, skill_id)
);

-- 3. Skill requests
CREATE TABLE IF NOT EXISTS skill_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skill_source TEXT NOT NULL DEFAULT 'clawhub',
  skill_category TEXT DEFAULT '',
  skill_description TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  evidence_task_ids TEXT[] DEFAULT '{}',
  urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'installed')),
  scan_result TEXT NOT NULL DEFAULT 'pending' CHECK (scan_result IN ('pending', 'clean', 'suspicious', 'blocked')),
  scan_notes TEXT DEFAULT '',
  requested_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_month ON agent_skills(month_installed);
CREATE INDEX IF NOT EXISTS idx_skill_requests_status ON skill_requests(status);
CREATE INDEX IF NOT EXISTS idx_skill_requests_agent ON skill_requests(agent_id);

-- RLS
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_skills" ON skills FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_skills" ON skills FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_agent_skills" ON agent_skills FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_agent_skills" ON agent_skills FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_delete_agent_skills" ON agent_skills FOR DELETE TO anon USING (true);

CREATE POLICY "anon_select_skill_requests" ON skill_requests FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_skill_requests" ON skill_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_skill_requests" ON skill_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);
