-- Phase 5C: Notifications table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN (
    'blocker_detected',
    'blocker_resolved',
    'agent_paused',
    'agent_resumed',
    'system_alert',
    'task_reassigned',
    'task_completed'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info')),
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  related_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications (severity);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_notifications" ON notifications FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_notifications" ON notifications FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_notifications" ON notifications FOR UPDATE TO anon USING (true) WITH CHECK (true);
