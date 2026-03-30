-- Phase 6C: Departments and Specialists
-- Run this in Supabase SQL Editor

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_id TEXT UNIQUE NOT NULL,
  emoji TEXT DEFAULT '🏢',
  mandate TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  agent_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Specialists
CREATE TABLE IF NOT EXISTS specialists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  mission TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'terminated')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  assigned_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  spawn_source TEXT DEFAULT 'manual',
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  output_summary TEXT
);

-- 3. Specialist types (registry)
CREATE TABLE IF NOT EXISTS specialist_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  spawn_count INT DEFAULT 0,
  last_spawned TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);
CREATE INDEX IF NOT EXISTS idx_specialists_status ON specialists(status);
CREATE INDEX IF NOT EXISTS idx_specialists_department ON specialists(department_id);
CREATE INDEX IF NOT EXISTS idx_specialists_type ON specialists(type);

-- RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialist_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_departments" ON departments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_departments" ON departments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_departments" ON departments FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_specialists" ON specialists FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_specialists" ON specialists FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_specialists" ON specialists FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_specialist_types" ON specialist_types FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_specialist_types" ON specialist_types FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_specialist_types" ON specialist_types FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Seed: Persistent departments
INSERT INTO departments (name, short_id, emoji, mandate, domain, status, priority) VALUES
  ('Export-Growth', 'export-growth', '📦', 'Drive export execution, lead generation, and buyer follow-up', 'Export execution, lead generation, buyer follow-up, shipment planning', 'active', 'high'),
  ('Ops-Improvement', 'ops-improvement', '⚙️', 'Improve workflows, processes, routines, and operational clarity', 'Workflows, process improvement, routines, automation', 'active', 'high'),
  ('Architecture-Systems', 'architecture-systems', '🏗️', 'Design platform architecture, data models, and system structure', 'Platform design, data modeling, system architecture, integration', 'active', 'medium')
ON CONFLICT (short_id) DO NOTHING;

-- Seed: Specialist types
INSERT INTO specialist_types (name, category, description) VALUES
  ('Export Documentation Specialist', 'Export-Growth', 'Handles export documentation, customs, and compliance'),
  ('Buyer Follow-up Specialist', 'Export-Growth', 'Manages buyer communication and follow-up cycles'),
  ('Sourcing Intelligence Specialist', 'Export-Growth', 'Researches suppliers, markets, and sourcing opportunities'),
  ('Ops Bottleneck Analyst', 'Ops-Improvement', 'Identifies and resolves operational bottlenecks'),
  ('Workflow Automation Specialist', 'Ops-Improvement', 'Designs and implements workflow automations'),
  ('Data Quality Auditor', 'Ops-Improvement', 'Audits data quality and proposes corrections'),
  ('Architecture Reviewer', 'Architecture-Systems', 'Reviews system architecture and proposes improvements'),
  ('UI/UX Systems Designer', 'Architecture-Systems', 'Designs user interfaces and system interaction patterns'),
  ('KPI & Governance Analyst', 'Ops-Improvement', 'Tracks KPIs and governance compliance'),
  ('Partnership Concept Specialist', 'Export-Growth', 'Develops partnership and collaboration frameworks'),
  ('Credit / Risk Structuring Specialist', 'Export-Growth', 'Structures credit terms and risk assessment')
ON CONFLICT (name) DO NOTHING;
