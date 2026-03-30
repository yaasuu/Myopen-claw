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
  status: "pending" | "in-progress" | "blocked" | "done";
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
    | "specialist_promoted_recommended";
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
