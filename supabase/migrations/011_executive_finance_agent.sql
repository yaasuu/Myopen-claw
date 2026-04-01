-- Phase 7D: Executive Finance Agent
-- Add the Executive Finance Agent for personal/home finance visibility

INSERT INTO agents (name, short_id, emoji, description, domain, status)
VALUES (
  'Executive Finance Agent',
  'executive-finance',
  '💰',
  'Personal finance visibility — tracks household cash flow, spending patterns, grocery planning, and budget monitoring for home purposes',
  'Personal finance, cash spending, grocery planning, household budget, spending visibility',
  'active'
)
ON CONFLICT (short_id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  domain = EXCLUDED.domain;

-- Add finance-related specialist types
INSERT INTO specialist_types (name, category, description) VALUES
  ('Spending Pattern Analyst', 'Finance', 'Analyzes household spending patterns and identifies savings opportunities'),
  ('Grocery Planning Specialist', 'Finance', 'Optimizes grocery lists, tracks prices, and plans household purchases'),
  ('Budget Tracker Specialist', 'Finance', 'Monitors budget adherence and flags overspending'),
  ('Bill & Subscription Auditor', 'Finance', 'Reviews recurring bills and subscriptions for optimization')
ON CONFLICT (name) DO NOTHING;
