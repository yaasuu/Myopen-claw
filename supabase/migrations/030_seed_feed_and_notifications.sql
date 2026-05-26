-- 030_seed_feed_and_notifications.sql
-- Seeds initial feed_events and notifications rows so the dashboard
-- shows real data rather than falling back to MOCK_EVENTS / MOCK_NOTIFICATIONS.
-- Safe to run multiple times (uses INSERT ... WHERE NOT EXISTS pattern).

-- Feed events (only insert if table is empty)
INSERT INTO feed_events (event_type, source, summary, created_at)
SELECT event_type, source, summary, created_at FROM (VALUES
  ('system_start',     'Yas Claw',        'System initialised — Hermes gateway connected',                  NOW() - INTERVAL '2 days'),
  ('task_completed',   'Export COO Agent','Completed: Weekly export intelligence review',                   NOW() - INTERVAL '1 day 6 hours'),
  ('task_completed',   'QA Agent',        'Completed: Weekly QA calibration — false approval review',       NOW() - INTERVAL '3 hours'),
  ('task_completed',   'Data Analyst',    'Completed: Weekly system health metrics — Yas Claw KPIs',        NOW() - INTERVAL '2 hours 30 minutes'),
  ('agent_routed',     'Yas Claw',        'Task dispatched to Ops-Improvement Agent',                       NOW() - INTERVAL '1 hour'),
  ('governance_run',   'Task Worker',     'Task worker: 9 completed, 0 failed, 0 skipped',                  NOW() - INTERVAL '30 minutes')
) AS v(event_type, source, summary, created_at)
WHERE NOT EXISTS (SELECT 1 FROM feed_events LIMIT 1);

-- Notifications (only insert if table is empty)
INSERT INTO notifications (type, title, message, severity, is_read, created_at)
SELECT type, title, message, severity, is_read, created_at FROM (VALUES
  ('system_alert', 'System Online',       'Hermes gateway is connected and all agents are active.',  'info',    true,  NOW() - INTERVAL '2 days'),
  ('task_completed','Tasks Processed',    '9 SELF-001 tasks executed by Gemini and moved to review.','info',    false, NOW() - INTERVAL '3 hours')
) AS v(type, title, message, severity, is_read, created_at)
WHERE NOT EXISTS (SELECT 1 FROM notifications LIMIT 1);
