export interface Agent {
  id: string;
  name: string;
  short_id: string;
  emoji: string;
  description: string;
  status: "active" | "paused" | "retired";
  domain: string;
  task_count: number;
  last_activity: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "blocked" | "in-review" | "done";
  priority: "high" | "medium" | "low";
  assigned_agent_id: string | null;
  blocker: string | null;
  owner: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAgent extends Task {
  assigned_agent_name: string | null;
  assigned_agent_emoji: string | null;
}

export interface FeedEvent {
  id: string;
  event_type:
    | "task_created"
    | "task_updated"
    | "task_completed"
    | "agent_routed"
    | "agent_paused"
    | "agent_resumed"
    | "agent_hired"
    | "system_alert"
    | "blocker_detected"
    | "blocker_resolved"
    | "governance_daily_run"
    | "governance_weekly_run"
    | "governance_monthly_run"
    | "governance_quarterly_run"
    | "autonomy_state_changed"
    | "governance_issue_detected"
    | "department_created"
    | "department_updated"
    | "department_paused"
    | "department_resumed"
    | "specialist_spawned"
    | "specialist_completed"
    | "specialist_terminated"
    | "specialist_promoted_recommended"
    | "portfolio_review_run"
    | "portfolio_risk_detected"
    | "portfolio_rebalance_triggered"
    | "skill_requested"
    | "skill_approved"
    | "skill_rejected"
    | "skill_installed"
    | "skill_scan_clean"
    | "skill_scan_flagged"
    | "discussion_started"
    | "discussion_summary_logged"
    | "finding_logged"
    | "proposal_created"
    | "approval_requested"
    | "approval_granted"
    | "approval_rejected"
    | "task_returned_for_rework"
    | "capability_gap_detected"
    | "capability_review_requested"
    | "skill_recommendation_approved"
    | "skill_recommendation_rejected"
    | "capability_gap_resolved";
  source: string;
  summary: string;
  related_task_id: string | null;
  related_agent_id: string | null;
  created_at: string;
}

export interface OrgNode {
  id: string;
  name: string;
  role: string;
  emoji: string;
  status: "active" | "paused" | "retired";
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface SystemStatus {
  id: string;
  status: "healthy" | "degraded" | "down";
  active_agents: number;
  open_tasks: number;
  blocked_tasks: number;
  last_event: string | null;
  checked_at: string;
}

export interface Department {
  id: string;
  name: string;
  short_id: string;
  emoji: string;
  mandate: string;
  domain: string;
  status: "active" | "paused";
  priority: "high" | "medium" | "low";
  agent_count: number;
  created_at: string;
}

export type SpecialistStatus = "active" | "completed" | "terminated";

export interface Specialist {
  id: string;
  name: string;
  type: string;
  mission: string;
  status: SpecialistStatus;
  department_id: string | null;
  assigned_task_id: string | null;
  spawn_source: string;
  started_at: string;
  ended_at: string | null;
  output_summary: string | null;
}

export interface SpecialistType {
  id: string;
  name: string;
  category: string;
  description: string;
  spawn_count: number;
  last_spawned: string | null;
}

export type SkillScanResult = "pending" | "clean" | "suspicious" | "blocked";

export type SkillRequestStatus = "pending" | "approved" | "rejected" | "installed";

export interface Skill {
  id: string;
  name: string;
  source: string; // "clawhub" or "manual"
  category: string;
  description: string;
  installed_at: string;
}

export interface AgentSkill {
  agent_id: string;
  skill_id: string;
  skill_name: string;
  skill_category: string;
  installed_at: string;
  month_installed: string; // "2026-03" for quota tracking
}

export interface SkillRequest {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  skill_name: string;
  skill_source: string;
  skill_category: string;
  skill_description: string;
  reason: string;
  evidence_task_ids: string[];
  urgency: "high" | "medium" | "low";
  status: SkillRequestStatus;
  scan_result: SkillScanResult;
  scan_notes: string;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

// ── Phase 11K: Capability Governance ─────────────────

export type GapCategory =
  | "missing_skill"
  | "wrong_assignment"
  | "unclear_scope"
  | "dependency_blocker"
  | "missing_process"
  | "approval_delay";

export type ConfidenceLevel = "low" | "medium" | "high";
export type UrgencyLevel = "low" | "medium" | "high";

export type GapReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "resolved"
  | "monitoring";

export type SignalType =
  | "repeated_blocked_tasks"
  | "rejected_review"
  | "rework_cycle"
  | "tool_mention_no_skill"
  | "session_tool_failure"
  | "unassigned_pending"
  | "user_correction"
  | "fallback_chain"
  | "keyword_cluster";

export interface CapabilityGap {
  id: string;
  agent_id: string | null;
  agent_name?: string;
  agent_emoji?: string;
  gap_category: GapCategory;
  capability_area: string;
  missing_skill_slug: string;
  missing_skill_name: string;
  confidence_level: ConfidenceLevel;
  urgency_level: UrgencyLevel;
  evidence_count: number;
  evidence_summary: string;
  evidence_task_ids: string[];
  evidence_session_ids: string[];
  why_flagged: string;
  recommended_action: string;
  review_status: GapReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface GapEvidence {
  id: string;
  gap_id: string;
  signal_type: SignalType;
  severity: "low" | "medium" | "high" | "critical";
  source: "session" | "task" | "feed_event" | "review" | "discussion";
  source_id: string;
  evidence_text: string;
  detected_at: string;
}

export interface AuditRun {
  id: string;
  run_date: string;
  sessions_scanned: number;
  tasks_scanned: number;
  feed_events_scanned: number;
  gaps_detected: number;
  new_gaps: number;
  critical_gaps: number;
  resolved_gaps: number;
  summary: string;
  run_duration_ms: number;
  created_at: string;
}

export interface CapabilityImprovement {
  id: string;
  gap_id: string;
  skill_slug: string;
  agent_id: string | null;
  measured_at: string;
  days_since_install: number;
  blocker_count_before: number;
  blocker_count_after: number;
  rework_count_before: number;
  rework_count_after: number;
  review_pass_rate_before: number;
  review_pass_rate_after: number;
  improvement_score: number;
  notes: string;
}

export interface Project {
  id: string;
  project_code: string;
  title: string;
  objective: string;
  scope: string;
  deliverables: string[];
  success_criteria: string[];
  owner_department: string;
  status: "planning" | "active" | "on-hold" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
  progress: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  open_tasks: number;
  blocked_tasks: number;
  completed_tasks: number;
}

export type MilestoneStatus = "pending" | "in_progress" | "done" | "missed";

export interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: MilestoneStatus;
  owner: string;
  notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ReviewType = "weekly" | "executive" | "risk";

export interface ProjectReview {
  id: string;
  project_id: string;
  review_type: ReviewType;
  summary: string;
  blockers: string[];
  decisions: string[];
  recommended_actions: string[];
  created_at: string;
}

export interface ProjectDecision {
  id: string;
  project_id: string;
  title: string;
  summary: string;
  decision_type: string;
  decided_by: string;
  impact_level: "high" | "medium" | "low";
  created_at: string;
}

export type ProjectHealth = "healthy" | "watch" | "at_risk" | "critical";

export interface ProjectHealthScore {
  score: number; // 0-100
  status: ProjectHealth;
  factors: Array<{ label: string; impact: string; severity: "good" | "warn" | "bad" }>;
  escalationNeeded: boolean;
  escalationReason: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  author_role: "ceo" | "agent" | "system";
  content: string;
  created_at: string;
}

export interface WorkspaceFile {
  name: string;
  label: string;
  content: string;
  icon: string;
}

export interface AgentWorkspace {
  agent: Agent;
  soul: string;
  memory: string;
  skills: string;
  heartbeat: string;
  openTasks: number;
  blockedTasks: number;
  completedTasks: number;
}

export type UnitType = "orchestrator" | "department" | "agent" | "specialist" | "project";

export interface WorkspaceFile {
  id: string;
  unit_type: UnitType;
  unit_id: string;
  file_name: string;
  file_content: string;
  created_at: string;
  updated_at: string;
}

export interface FileRegistry {
  name: string;
  label: string;
  icon: string;
}

export type ReviewOutcome = "approved" | "rejected" | "returned_for_rework";

export interface TaskReview {
  id: string;
  task_id: string;
  outcome: ReviewOutcome;
  notes: string;
  reviewed_by: string;
  created_at: string;
}
