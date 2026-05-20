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

export interface Goal {
  id: string;
  title: string;
  description: string;
  parent_goal_id: string | null;
  status: "active" | "completed" | "paused" | "abandoned";
  created_at: string;
  updated_at: string;
}

export type TaskStatus =
  | "pending"
  | "dispatched"
  | "in-progress"
  | "submitted"
  | "in-review"
  | "approved"
  | "blocked"
  | "rework"
  | "done";

export type TaskReviewStatus = "pending" | "submitted" | "in_review" | "approved" | "rejected" | "returned_for_rework";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
  assigned_agent_id: string | null;
  owner_agent_id?: string | null;
  handled_by_agent_id?: string | null;
  project_id: string | null;
  goal_id: string | null;
  blocker: string | null;
  owner: string;
  review_status?: TaskReviewStatus;
  review_notes?: string;
  reviewed_by?: string | null;
  requires_yas_approval?: boolean;
  dispatch_notes?: string;
  dispatched_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAgent extends Task {
  assigned_agent_name: string | null;
  assigned_agent_emoji: string | null;
  goal_title: string | null;
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
  slug: string;
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
  status?: string;
}

export interface AgentSkill {
  id?: string;
  agent_id: string;
  agent_name?: string;
  agent_emoji?: string;
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
  | "monitored"
  | "resolved";

export type OwnerRoute =
  | "yas-claw"
  | "data-analyst"
  | "architecture-systems"
  | "ceo";

export type SignalType =
  | "blocked_task"
  | "rejected_review"
  | "returned_for_rework"
  | "keyword_mention"
  | "manual_workaround"
  | "missing_installed_skill"
  | "discussion_signal"
  | "repeated_failure";

export type AuditRunStatus = "running" | "completed" | "failed";

export interface CapabilityAuditRun {
  id: string;
  run_date: string;
  run_started_at: string;
  run_completed_at: string | null;
  status: AuditRunStatus;
  total_agents_scanned: number;
  total_tasks_scanned: number;
  total_signals_detected: number;
  total_gaps_created: number;
  total_high_confidence: number;
  total_medium_confidence: number;
  total_low_confidence: number;
  summary: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CapabilityGap {
  id: string;
  audit_run_id: string | null;
  agent_id: string;
  agent_name?: string;
  agent_emoji?: string;
  missing_skill_slug: string | null;
  missing_skill_name: string;
  gap_category: GapCategory;
  confidence_level: ConfidenceLevel;
  urgency_level: UrgencyLevel;
  composite_score: number;
  evidence_count: number;
  why_flagged: string;
  recommended_action: string;
  owner_route: OwnerRoute;
  review_status: GapReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_notes: string;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export type EvidenceType =
  | "task_keyword"
  | "blocked_task"
  | "rejected_review"
  | "returned_for_rework"
  | "discussion_signal"
  | "proposal_signal"
  | "approval_signal"
  | "tool_mention"
  | "manual_workaround"
  | "repeat_assignment"
  | "live_feed_event";

export interface CapabilityGapEvidence {
  id: string;
  gap_id: string;
  agent_id: string;
  evidence_type: EvidenceType;
  source_table: string | null;
  source_id: string | null;
  source_label: string;
  source_excerpt: string;
  weight: number;
  detected_at: string;
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
  submitted_tasks: number;
  approved_tasks: number;
  review_count: number;
  last_review_at: string | null;
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
  review_stage?: "worker_submission" | "orchestrator" | "yas";
  evidence?: string;
  risk_notes?: string;
  action_required?: string;
  created_at: string;
}
