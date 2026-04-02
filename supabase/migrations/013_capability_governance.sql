-- Phase 11K: Capability Governance — Nightly Skill Gap Detection
-- Run this in Supabase SQL Editor

-- 1. Capability gaps — detected by nightly audit
CREATE TABLE IF NOT EXISTS capability_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  gap_category TEXT NOT NULL CHECK (gap_category IN (
    'missing_skill', 'wrong_assignment', 'unclear_scope',
    'dependency_blocker', 'missing_process', 'approval_delay'
  )),
  capability_area TEXT NOT NULL,
  missing_skill_slug TEXT DEFAULT '',
  missing_skill_name TEXT DEFAULT '',
  confidence_level TEXT NOT NULL DEFAULT 'medium' CHECK (confidence_level IN ('low', 'medium', 'high')),
  urgency_level TEXT NOT NULL DEFAULT 'medium' CHECK (urgency_level IN ('low', 'medium', 'high')),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  evidence_summary TEXT DEFAULT '',
  evidence_task_ids TEXT[] DEFAULT '{}',
  evidence_session_ids TEXT[] DEFAULT '{}',
  why_flagged TEXT DEFAULT '',
  recommended_action TEXT DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'resolved', 'monitoring')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Evidence signals — raw detection signals for each gap
CREATE TABLE IF NOT EXISTS gap_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id UUID NOT NULL REFERENCES capability_gaps(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'repeated_blocked_tasks', 'rejected_review', 'rework_cycle',
    'tool_mention_no_skill', 'session_tool_failure', 'unassigned_pending',
    'user_correction', 'fallback_chain', 'keyword_cluster'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source TEXT NOT NULL DEFAULT 'session' CHECK (source IN ('session', 'task', 'feed_event', 'review', 'discussion')),
  source_id TEXT DEFAULT '',
  evidence_text TEXT DEFAULT '',
  detected_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Audit runs — nightly audit log
CREATE TABLE IF NOT EXISTS audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sessions_scanned INTEGER DEFAULT 0,
  tasks_scanned INTEGER DEFAULT 0,
  feed_events_scanned INTEGER DEFAULT 0,
  gaps_detected INTEGER DEFAULT 0,
  new_gaps INTEGER DEFAULT 0,
  critical_gaps INTEGER DEFAULT 0,
  resolved_gaps INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  run_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Capability improvement tracking (for post-install feedback)
CREATE TABLE IF NOT EXISTS capability_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id UUID NOT NULL REFERENCES capability_gaps(id) ON DELETE CASCADE,
  skill_slug TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  measured_at TIMESTAMPTZ DEFAULT now(),
  days_since_install INTEGER DEFAULT 0,
  blocker_count_before INTEGER DEFAULT 0,
  blocker_count_after INTEGER DEFAULT 0,
  rework_count_before INTEGER DEFAULT 0,
  rework_count_after INTEGER DEFAULT 0,
  review_pass_rate_before NUMERIC(5,2) DEFAULT 0,
  review_pass_rate_after NUMERIC(5,2) DEFAULT 0,
  improvement_score NUMERIC(5,2) DEFAULT 0,
  notes TEXT DEFAULT ''
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_capability_gaps_agent ON capability_gaps(agent_id);
CREATE INDEX IF NOT EXISTS idx_capability_gaps_status ON capability_gaps(review_status);
CREATE INDEX IF NOT EXISTS idx_capability_gaps_confidence ON capability_gaps(confidence_level);
CREATE INDEX IF NOT EXISTS idx_capability_gaps_urgency ON capability_gaps(urgency_level);
CREATE INDEX IF NOT EXISTS idx_capability_gaps_last_seen ON capability_gaps(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_gap_evidence_gap ON gap_evidence(gap_id);
CREATE INDEX IF NOT EXISTS idx_gap_evidence_type ON gap_evidence(signal_type);
CREATE INDEX IF NOT EXISTS idx_audit_runs_date ON audit_runs(run_date DESC);

-- RLS
ALTER TABLE capability_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE gap_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_improvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_gaps" ON capability_gaps FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_gaps" ON capability_gaps FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_gaps" ON capability_gaps FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_select_evidence" ON gap_evidence FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_evidence" ON gap_evidence FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_audits" ON audit_runs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_audits" ON audit_runs FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_improvements" ON capability_improvements FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_improvements" ON capability_improvements FOR INSERT TO anon WITH CHECK (true);

-- Add new feed event types
-- These will be used by the governance system:
--   capability_gap_detected
--   capability_review_requested
--   skill_recommendation_approved
--   skill_recommendation_rejected
--   capability_gap_resolved

-- Updated at trigger for capability_gaps
CREATE OR REPLACE FUNCTION update_capability_gap_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_capability_gaps_updated
  BEFORE UPDATE ON capability_gaps
  FOR EACH ROW
  EXECUTE FUNCTION update_capability_gap_timestamp();
