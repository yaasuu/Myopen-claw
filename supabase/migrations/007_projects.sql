-- Phase 7A: Projects
-- Run this in Supabase SQL Editor

-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  objective TEXT DEFAULT '',
  scope TEXT DEFAULT '',
  deliverables TEXT[] DEFAULT '{}',
  success_criteria TEXT[] DEFAULT '{}',
  owner_department TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on-hold', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add project_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_department ON projects(owner_department);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_projects" ON projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Seed
INSERT INTO projects (project_code, title, objective, scope, deliverables, success_criteria, owner_department, status, priority, progress, due_date) VALUES
  ('YAS-001', 'Mission Control Dashboard', 'Build the CEO-facing mission control dashboard for Yas Claw', 'Full-stack Next.js + Supabase dashboard with auth, tasks, agents, departments, skills', ARRAY['Working dashboard','Auth system','Task board','Agent management'], ARRAY['All routes compile','Auth working','Realtime updates active'], 'Architecture-Systems', 'active', 'high', 75, '2026-04-15'),
  ('YAS-002', 'Export Pipeline Automation', 'Automate export documentation and buyer follow-up workflows', 'Export documentation generation, buyer communication templates, shipment tracking', ARRAY['Document templates','Follow-up automation','Tracking integration'], ARRAY['50% reduction in manual export tasks','Buyer response time < 24h'], 'Export-Growth', 'active', 'high', 30, '2026-05-01'),
  ('YAS-003', 'Ops Workflow Redesign', 'Review and optimize all internal operational workflows', 'Map current workflows, identify bottlenecks, propose improvements, implement changes', ARRAY['Workflow map','Bottleneck report','Improved SOPs'], ARRAY['All workflows documented','3+ bottlenecks resolved'], 'Ops-Improvement', 'planning', 'medium', 10, '2026-06-01')
ON CONFLICT (project_code) DO NOTHING;
