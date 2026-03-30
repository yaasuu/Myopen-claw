-- Phase 5A: Audit log table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_email TEXT DEFAULT 'unknown',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('task', 'agent', 'system')),
  target_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- RLS: allow anon insert (for logging), admin read
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_audit" ON audit_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_audit" ON audit_log FOR SELECT TO anon USING (true);
