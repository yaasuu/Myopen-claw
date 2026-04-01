-- Phase 7E: Expand feed_events event_type constraint
-- The original constraint only had 9 types. Dashboard expects 30+.
-- Also adds discussion/decision logging types for agent coordination visibility.

ALTER TABLE feed_events DROP CONSTRAINT IF EXISTS feed_events_event_type_check;

ALTER TABLE feed_events ADD CONSTRAINT feed_events_event_type_check CHECK (event_type IN (
  -- Task lifecycle
  'task_created', 'task_updated', 'task_completed',
  -- Agent lifecycle
  'agent_routed', 'agent_paused', 'agent_resumed', 'agent_hired',
  -- System
  'system_alert', 'blocker_detected', 'blocker_resolved',
  -- Governance
  'governance_daily_run', 'governance_weekly_run', 'governance_monthly_run', 'governance_quarterly_run',
  'autonomy_state_changed', 'governance_issue_detected',
  -- Departments
  'department_created', 'department_updated', 'department_paused', 'department_resumed',
  -- Specialists
  'specialist_spawned', 'specialist_completed', 'specialist_terminated', 'specialist_promoted_recommended',
  -- Portfolio
  'portfolio_review_run', 'portfolio_risk_detected', 'portfolio_rebalance_triggered',
  -- Skills
  'skill_requested', 'skill_approved', 'skill_rejected', 'skill_installed', 'skill_scan_clean', 'skill_scan_flagged',
  -- Agent coordination (NEW)
  'agent_decision', 'agent_discussion', 'agent_routing', 'plan_created', 'plan_updated'
));
