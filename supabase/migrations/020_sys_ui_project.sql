-- Migration 020: SYS-UI-001 System Structure & UI Improvements project
-- Project + initial tasks + Learning QA Agent

-- 1. Add Learning QA Agent
INSERT INTO agents (name, short_id, emoji, description, status, domain) VALUES
  ('Learning QA Agent', 'learning-qa', '🎓', 'Creates system lessons from production issues, identifies patterns, and builds organizational knowledge', 'active', 'Lesson extraction, pattern analysis, knowledge management, post-incident review')
ON CONFLICT (short_id) DO NOTHING;

-- 2. Create SYS-UI-001 project
INSERT INTO projects (project_code, title, objective, scope, deliverables, success_criteria, owner_department, status, priority, progress, due_date) VALUES
  ('SYS-UI-001', 'Yas Claw System Structure & UI Improvements', 'Improve the Yas Claw dashboard, system structure, data wiring, and UI reliability', 'Review dashboard pages, Supabase schema, frontend data adapters, navigation, task workflows, Learning Hub, Workforce, Org Chart, and production deployment safety', ARRAY['Dashboard structure reviewed','Schema audit complete','UI improvement backlog created','System lessons documented'], ARRAY['All dashboard pages reviewed','Schema aligned with frontend needs','UI backlog prioritized','Lessons captured from past issues'], 'Architecture-Systems', 'active', 'high', 0, '2026-06-30')
ON CONFLICT (project_code) DO NOTHING;

-- 3. Create initial tasks (will reference the project and agents)
-- Note: We use subqueries to get the correct UUIDs

-- Task 1: Review dashboard structure and navigation
INSERT INTO tasks (title, description, status, priority, assigned_agent_id, project_id, owner)
SELECT
  'Review dashboard structure and navigation',
  'Review all dashboard pages, navigation flow, sidebar organization, and information architecture. Identify gaps and improvement opportunities.',
  'pending',
  'high',
  a.id,
  p.id,
  'Yas'
FROM agents a, projects p
WHERE a.short_id = 'architecture-systems' AND p.project_code = 'SYS-UI-001';

-- Task 2: Audit Supabase schema vs frontend data needs
INSERT INTO tasks (title, description, status, priority, assigned_agent_id, project_id, owner)
SELECT
  'Audit Supabase schema vs frontend data needs',
  'Compare Supabase schema with frontend type definitions and data adapters. Identify mismatches, missing columns, type inconsistencies, and RLS policy gaps.',
  'pending',
  'high',
  a.id,
  p.id,
  'Yas'
FROM agents a, projects p
WHERE a.short_id = 'architecture-systems' AND p.project_code = 'SYS-UI-001';

-- Task 3: Review Learning Hub UI and data flow
INSERT INTO tasks (title, description, status, priority, assigned_agent_id, project_id, owner)
SELECT
  'Review Learning Hub UI and data flow',
  'Review the Learning Hub page UI, data flow, and user experience. Identify improvements for clarity, usability, and visual consistency.',
  'pending',
  'medium',
  a.id,
  p.id,
  'Yas'
FROM agents a, projects p
WHERE a.short_id = 'ui-ux-designer' AND p.project_code = 'SYS-UI-001';

-- Task 4: Review Workforce and Org Chart data wiring
INSERT INTO tasks (title, description, status, priority, assigned_agent_id, project_id, owner)
SELECT
  'Review Workforce and Org Chart data wiring',
  'Review Workforce and Org Chart pages for data correctness, realtime updates, and UI reliability. Ensure org tree renders correctly and agent status is accurate.',
  'pending',
  'high',
  a.id,
  p.id,
  'Yas'
FROM agents a, projects p
WHERE a.short_id = 'architecture-systems' AND p.project_code = 'SYS-UI-001';

-- Task 5: Create UI improvement backlog
INSERT INTO tasks (title, description, status, priority, assigned_agent_id, project_id, owner)
SELECT
  'Create UI improvement backlog',
  'Compile a prioritized backlog of UI improvements across all dashboard pages. Include screenshots, severity ratings, and estimated effort.',
  'pending',
  'medium',
  a.id,
  p.id,
  'Yas'
FROM agents a, projects p
WHERE a.short_id = 'ui-ux-designer' AND p.project_code = 'SYS-UI-001';

-- Task 6: Create system lessons from previous production/data issues
INSERT INTO tasks (title, description, status, priority, assigned_agent_id, project_id, owner)
SELECT
  'Create system lessons from previous production/data issues',
  'Review past production incidents, data issues, and bugs. Extract lessons learned and document them in the knowledge base for future reference.',
  'pending',
  'high',
  a.id,
  p.id,
  'Yas'
FROM agents a, projects p
WHERE a.short_id = 'learning-qa' AND p.project_code = 'SYS-UI-001';
