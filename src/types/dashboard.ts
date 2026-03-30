export interface Agent {
  id: string;
  name: string;
  shortId: string;
  emoji: string;
  description: string;
  status: "active" | "paused" | "retired";
  domain: string;
  taskCount: number;
  lastActivity: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "blocked" | "done";
  priority: "high" | "medium" | "low";
  assignedAgent: string | null;
  blocker: string | null;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedEvent {
  id: string;
  timestamp: string;
  type:
    | "task_created"
    | "task_updated"
    | "task_completed"
    | "agent_routed"
    | "agent_paused"
    | "agent_resumed"
    | "system_alert"
    | "blocker_detected"
    | "blocker_resolved";
  source: string;
  summary: string;
  relatedTaskId?: string;
  relatedAgentId?: string;
}

export interface OrgNode {
  id: string;
  name: string;
  role: string;
  emoji: string;
  status: "active" | "paused" | "retired";
  children: OrgNode[];
}

export interface SystemStatus {
  status: "healthy" | "degraded" | "down";
  activeAgents: number;
  openTasks: number;
  blockedTasks: number;
  lastEvent: string | null;
}
