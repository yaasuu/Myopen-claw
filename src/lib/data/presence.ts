import type { Agent, TaskWithAgent, FeedEvent } from "@/types/dashboard";

export type PresenceState =
  | "available"
  | "working"
  | "in_discussion"
  | "in_review"
  | "blocked"
  | "waiting_for_input"
  | "paused"
  | "offline";

export interface AgentPresence {
  agentId: string;
  state: PresenceState;
  label: string;
  currentTask: string | null;
  openTasks: number;
  blockedTasks: number;
  inReviewTasks: number;
  lastActivity: string | null;
}

const PRESENCE_CONFIG: Record<PresenceState, { label: string; color: string; dot: string }> = {
  available: { label: "Available", color: "var(--success)", dot: "dot-green" },
  working: { label: "Working", color: "var(--info)", dot: "dot-blue" },
  in_discussion: { label: "In Discussion", color: "var(--accent)", dot: "bg-violet-500" },
  in_review: { label: "Awaiting Review", color: "var(--warning)", dot: "dot-amber" },
  blocked: { label: "Blocked", color: "var(--danger)", dot: "dot-red" },
  waiting_for_input: { label: "Waiting for Input", color: "var(--warning)", dot: "dot-amber" },
  paused: { label: "Paused", color: "var(--text-quiet)", dot: "dot-gray" },
  offline: { label: "Offline", color: "var(--text-quiet)", dot: "dot-gray" },
};

export function getPresenceConfig(state: PresenceState) {
  return PRESENCE_CONFIG[state];
}

export function deriveAgentPresence(
  agent: Agent,
  tasks: TaskWithAgent[],
  feedEvents: FeedEvent[]
): AgentPresence {
  const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const openTasks = agentTasks.filter((t) => t.status !== "done");
  const blockedTasks = agentTasks.filter((t) => t.status === "blocked");
  const inReviewTasks = agentTasks.filter((t) => t.status === "in-review");
  const inProgressTasks = agentTasks.filter((t) => t.status === "in-progress");

  // Current task (most recent non-done task)
  const currentTask = openTasks.length > 0 ? openTasks[0].title : null;

  // Recent feed events for this agent
  const recentEvents = feedEvents
    .filter((e) => e.related_agent_id === agent.id)
    .slice(0, 5);

  const hasDiscussion = recentEvents.some((e) =>
    e.event_type === "discussion_started" || e.event_type === "discussion_summary_logged"
  );

  const hasApprovalPending = recentEvents.some((e) =>
    e.event_type === "approval_requested"
  );

  let state: PresenceState;
  let label: string;

  if (agent.status === "paused") {
    state = "paused";
    label = "Paused";
  } else if (blockedTasks.length > 0 && openTasks.length === blockedTasks.length) {
    state = "blocked";
    label = `${blockedTasks.length} blocked — needs attention`;
  } else if (inReviewTasks.length > 0) {
    state = "in_review";
    label = `${inReviewTasks.length} task${inReviewTasks.length > 1 ? "s" : ""} awaiting review`;
  } else if (hasApprovalPending) {
    state = "waiting_for_input";
    label = "Approval requested";
  } else if (hasDiscussion) {
    state = "in_discussion";
    label = "In discussion";
  } else if (inProgressTasks.length > 0) {
    state = "working";
    label = `Working on ${inProgressTasks.length} task${inProgressTasks.length > 1 ? "s" : ""}`;
  } else if (openTasks.length > 0) {
    state = "working";
    label = `${openTasks.length} pending task${openTasks.length > 1 ? "s" : ""}`;
  } else {
    state = "available";
    label = "Available";
  }

  return {
    agentId: agent.id,
    state,
    label,
    currentTask,
    openTasks: openTasks.length,
    blockedTasks: blockedTasks.length,
    inReviewTasks: inReviewTasks.length,
    lastActivity: agent.last_activity,
  };
}
