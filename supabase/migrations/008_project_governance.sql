-- Phase 7C: Project Governance
-- Run this in Supabase SQL Editor

-- 1. Milestones
CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'missed')),
  owner TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Reviews
CREATE TABLE IF NOT EXISTS project_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL CHECK (review_type IN ('weekly', 'executive', 'risk')),
  summary TEXT DEFAULT '',
  blockers TEXT[] DEFAULT '{}',
  decisions TEXT[] DEFAULT '{}',
  recommended_actions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Decisions
CREATE TABLE IF NOT EXISTS project_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  decision_type TEXT DEFAULT 'general',
  decided_by TEXT DEFAULT 'Yas',
  impact_level TEXT NOT NULL DEFAULT 'medium' CHECK (impact_level IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
CREATE INDEX IF NOT EXISTS idx_reviews_project ON project_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_type ON project_reviews(review_type);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON project_decisions(project_id);

-- RLS
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_milestones" ON project_milestones FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_milestones" ON project_milestones FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_milestones" ON project_milestones FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_reviews" ON project_reviews FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_reviews" ON project_reviews FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_decisions" ON project_decisions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_decisions" ON project_decisions FOR INSERT TO anon WITH CHECK (true);

-- Seed milestones for YAS-001
INSERT INTO project_milestones (project_id, title, due_date, status, owner, sort_order)
SELECT id, 'Dashboard MVP', '2026-04-01', 'done', 'Architecture-Systems', 1 FROM projects WHERE project_code = 'YAS-001'
ON CONFLICT DO NOTHING;
INSERT INTO project_milestones (project_id, title, due_date, status, owner, sort_order)
SELECT id, 'Auth + RBAC', '2026-04-05', 'in_progress', 'Architecture-Systems', 2 FROM projects WHERE project_code = 'YAS-001'
ON CONFLICT DO NOTHING;
INSERT INTO project_milestones (project_id, title, due_date, status, owner, sort_order)
SELECT id, 'Realtime + Notifications', '2026-04-10', 'pending', 'Architecture-Systems', 3 FROM projects WHERE project_code = 'YAS-001'
ON CONFLICT DO NOTHING;
INSERT INTO project_milestones (project_id, title, due_date, status, owner, sort_order)
SELECT id, 'Production Deploy', '2026-04-15', 'pending', 'Architecture-Systems', 4 FROM projects WHERE project_code = 'YAS-001'
ON CONFLICT DO NOTHING;
