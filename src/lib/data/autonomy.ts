import type { Agent, TaskWithAgent, FeedEvent } from "@/types/dashboard";
import type { HiringRecommendation } from "@/lib/data/hiring";

// ── Autonomy State ───────────────────────────────────

export type AutonomyState =
  | "STABLE"
  | "OPTIMIZING"
  | "EXPANDING"
  | "RESTRUCTURING"
  | "CRITICAL_INTERVENTION";

export interface AutonomyStatus {
  state: AutonomyState;
  reasoning: string;
  signals: AutonomySignal[];
  lastCalculated: string;
}

export interface AutonomySignal {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  relatedTaskIds?: string[];
  relatedAgentIds?: string[];
}

// ── Review Loops ─────────────────────────────────────

export type LoopType = "daily" | "weekly" | "monthly" | "quarterly";

export interface ReviewLoop {
  type: LoopType;
  label: string;
  status: "idle" | "running" | "completed";
  lastRun: string | null;
  nextRun: string | null;
  summary: LoopSummary;
}

export interface LoopSummary {
  tasksReviewed: number;
  blockersEscalated: number;
  actionsProposed: number;
  bottlenecksFound: number;
  departmentsReviewed: number;
  efficiencyImprovements: number;
  hireRecommendations: number;
  capabilityGaps: number;
  structuralIssues: number;
  redesignReadiness: number;
}

// ── Executive Review ─────────────────────────────────

export interface ExecutiveReview {
  id: string;
  type: LoopType;
  title: string;
  timestamp: string;
  summary: string;
  keyRisks: string[];
  recommendations: string[];
  relatedAlerts: string[];
}

// ── Recommended Action ───────────────────────────────

export interface RecommendedAction {
  id: string;
  type: "activate_agent" | "hire_agent" | "rebalance" | "escalate_blocker" | "review_governance" | "expand_department";
  title: string;
  description: string;
  urgency: "high" | "medium" | "low";
  relatedAgentId?: string;
  relatedTaskIds?: string[];
}

// ── Derive Autonomy State ────────────────────────────

export function deriveAutonomyState(
  tasks: TaskWithAgent[],
  agents: Agent[],
  hiringRecs: HiringRecommend[]
): AutonomyStatus {
  const signals: AutonomySignal[] = [];
  const activeAgents = agents.filter((a) => a.status === "active");
  const pausedAgents = agents.filter((a) => a.status === "paused");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
  const overdueTasks = tasks.filter((t) => {
    const age = Date.now() - new Date(t.created_at).getTime();
    return age > 72 * 3600000 && t.status !== "done";
  });

  // Critical blockers
  if (blockedTasks.length >= 5) {
    signals.push({
      type: "critical_blockers",
      severity: "high",
      message: `${blockedTasks.length} tasks are blocked — execution is stalled`,
      relatedTaskIds: blockedTasks.map((t) => t.id),
    });
  } else if (blockedTasks.length >= 3) {
    signals.push({
      type: "moderate_blockers",
      severity: "medium",
      message: `${blockedTasks.length} blocked tasks need attention`,
      relatedTaskIds: blockedTasks.map((t) => t.id),
    });
  }

  // Unassigned tasks
  if (unassignedTasks.length >= 4) {
    signals.push({
      type: "unassigned_tasks",
      severity: "high",
      message: `${unassignedTasks.length} tasks have no agent — workload is unowned`,
      relatedTaskIds: unassignedTasks.map((t) => t.id),
    });
  } else if (unassignedTasks.length >= 2) {
    signals.push({
      type: "unassigned_tasks",
      severity: "medium",
      message: `${unassignedTasks.length} unassigned tasks need routing`,
      relatedTaskIds: unassignedTasks.map((t) => t.id),
    });
  }

  // Overdue tasks
  if (overdueTasks.length >= 5) {
    signals.push({
      type: "overdue_backlog",
      severity: "high",
      message: `${overdueTasks.length} tasks overdue 3+ days — backlog is growing`,
      relatedTaskIds: overdueTasks.map((t) => t.id),
    });
  } else if (overdueTasks.length >= 3) {
    signals.push({
      type: "overdue_backlog",
      severity: "medium",
      message: `${overdueTasks.length} overdue tasks detected`,
      relatedTaskIds: overdueTasks.map((t) => t.id),
    });
  }

  // Paused agents
  if (pausedAgents.length >= 2) {
    signals.push({
      type: "paused_agents",
      severity: "medium",
      message: `${pausedAgents.length} agents are paused — capacity is reduced`,
      relatedAgentIds: pausedAgents.map((a) => a.id),
    });
  }

  // Overloaded agents
  const overloaded = agents.filter((a) => {
    return tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length >= 5;
  });
  if (overloaded.length > 0) {
    signals.push({
      type: "overloaded_agents",
      severity: "medium",
      message: `${overloaded.length} agent${overloaded.length > 1 ? "s" : ""} overloaded — workload imbalance`,
      relatedAgentIds: overloaded.map((a) => a.id),
    });
  }

  // Hire demand
  if (hiringRecs.length >= 3) {
    signals.push({
      type: "hire_demand",
      severity: "high",
      message: `${hiringRecs.length} hiring recommendations — expansion pressure detected`,
    });
  } else if (hiringRecs.length >= 1) {
    signals.push({
      type: "hire_demand",
      severity: "low",
      message: `${hiringRecs.length} hiring recommendation${hiringRecs.length > 1 ? "s" : ""} pending`,
    });
  }

  // Determine state
  const highSignals = signals.filter((s) => s.severity === "high");
  const mediumSignals = signals.filter((s) => s.severity === "medium");

  let state: AutonomyState;
  let reasoning: string;

  if (highSignals.length >= 2 || blockedTasks.length >= 5) {
    state = "CRITICAL_INTERVENTION";
    reasoning = "Multiple critical signals detected. Execution is stalled or severely degraded. CEO intervention required.";
  } else if (highSignals.length === 1 && mediumSignals.length >= 2) {
    state = "RESTRUCTURING";
    reasoning = "Structural issues detected — overloaded agents, unassigned work, and overdue backlog suggest the operating model needs adjustment.";
  } else if (hiringRecs.length >= 2 || (pausedAgents.length >= 1 && unassignedTasks.length >= 3)) {
    state = "EXPANDING";
    reasoning = "Repeated demand and unassigned workload indicate the team needs to grow. Hiring or activation is recommended.";
  } else if (mediumSignals.length >= 1 || blockedTasks.length >= 2) {
    state = "OPTIMIZING";
    reasoning = "Moderate inefficiencies detected. The system is functional but could be improved through rebalancing or process adjustments.";
  } else {
    state = "STABLE";
    reasoning = "All systems operating within normal parameters. No critical issues detected. Workforce is balanced.";
  }

  return {
    state,
    reasoning,
    signals,
    lastCalculated: new Date().toISOString(),
  };
}

// ── Generate Loop Summaries ──────────────────────────

export function generateLoopSummaries(
  tasks: TaskWithAgent[],
  agents: Agent[],
  hiringRecs: HiringRecommend[]
): Record<LoopType, ReviewLoop> {
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
  const pausedAgents = agents.filter((a) => a.status === "paused");
  const overloaded = agents.filter((a) =>
    tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length >= 5
  );

  const now = new Date();
  const nextDaily = new Date(now);
  nextDaily.setHours(nextDaily.getHours() + 1);
  const nextWeekly = new Date(now);
  nextWeekly.setDate(nextWeekly.getDate() + 1);
  const nextMonthly = new Date(now);
  nextMonthly.setDate(nextMonthly.getDate() + 7);
  const nextQuarterly = new Date(now);
  nextQuarterly.setDate(nextQuarterly.getDate() + 30);

  return {
    daily: {
      type: "daily",
      label: "Daily Mission Loop",
      status: "idle",
      lastRun: null,
      nextRun: nextDaily.toISOString(),
      summary: {
        tasksReviewed: tasks.length,
        blockersEscalated: blockedTasks.length,
        actionsProposed: unassignedTasks.length + blockedTasks.length,
        bottlenecksFound: 0,
        departmentsReviewed: 0,
        efficiencyImprovements: 0,
        hireRecommendations: 0,
        capabilityGaps: 0,
        structuralIssues: 0,
        redesignReadiness: 0,
      },
    },
    weekly: {
      type: "weekly",
      label: "Weekly Optimization Loop",
      status: "idle",
      lastRun: null,
      nextRun: nextWeekly.toISOString(),
      summary: {
        tasksReviewed: tasks.length,
        blockersEscalated: blockedTasks.length,
        actionsProposed: unassignedTasks.length + pausedAgents.length + overloaded.length,
        bottlenecksFound: overloaded.length,
        departmentsReviewed: 3,
        efficiencyImprovements: pausedAgents.length > 0 ? 1 : 0,
        hireRecommendations: hiringRecs.length,
        capabilityGaps: 0,
        structuralIssues: 0,
        redesignReadiness: 0,
      },
    },
    monthly: {
      type: "monthly",
      label: "Monthly Strategy Loop",
      status: "idle",
      lastRun: null,
      nextRun: nextMonthly.toISOString(),
      summary: {
        tasksReviewed: tasks.length,
        blockersEscalated: blockedTasks.length,
        actionsProposed: hiringRecs.length,
        bottlenecksFound: overloaded.length,
        departmentsReviewed: 3,
        efficiencyImprovements: 0,
        hireRecommendations: hiringRecs.length,
        capabilityGaps: unassignedTasks.length >= 3 ? 1 : 0,
        structuralIssues: overloaded.length >= 2 ? 1 : 0,
        redesignReadiness: 0,
      },
    },
    quarterly: {
      type: "quarterly",
      label: "Quarterly Redesign Loop",
      status: "idle",
      lastRun: null,
      nextRun: nextQuarterly.toISOString(),
      summary: {
        tasksReviewed: tasks.length,
        blockersEscalated: blockedTasks.length,
        actionsProposed: 0,
        bottlenecksFound: 0,
        departmentsReviewed: 3,
        efficiencyImprovements: 0,
        hireRecommendations: hiringRecs.length,
        capabilityGaps: 0,
        structuralIssues: 0,
        redesignReadiness: blockedTasks.length === 0 && unassignedTasks.length === 0 ? 80 : 40,
      },
    },
  };
}

// ── Generate Executive Reviews ───────────────────────

export function generateExecutiveReviews(
  tasks: TaskWithAgent[],
  agents: Agent[],
  signals: AutonomySignal[]
): ExecutiveReview[] {
  const reviews: ExecutiveReview[] = [];
  const now = new Date().toISOString();

  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
  const activeAgents = agents.filter((a) => a.status === "active");
  const pausedAgents = agents.filter((a) => a.status === "paused");

  // Daily snapshot
  reviews.push({
    id: "review-daily",
    type: "daily",
    title: "Daily Executive Snapshot",
    timestamp: now,
    summary: `${tasks.length} tasks tracked across ${activeAgents.length} active agents. ${blockedTasks.length} blocked, ${unassignedTasks.length} unassigned.`,
    keyRisks: blockedTasks.length > 0 ? [`${blockedTasks.length} blocked tasks`] : ["No critical risks"],
    recommendations: unassignedTasks.length > 0 ? ["Assign unassigned tasks"] : ["Maintain current course"],
    relatedAlerts: blockedTasks.slice(0, 3).map((t) => t.id),
  });

  // Weekly report
  const overloaded = agents.filter((a) =>
    tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length >= 5
  );
  reviews.push({
    id: "review-weekly",
    type: "weekly",
    title: "Weekly Executive Report",
    timestamp: now,
    summary: `Workforce: ${agents.length} agents (${activeAgents.length} active, ${pausedAgents.length} paused). ${overloaded.length} overloaded.`,
    keyRisks: [
      ...(overloaded.length > 0 ? [`${overloaded.length} agent${overloaded.length > 1 ? "s" : ""} overloaded`] : []),
      ...(pausedAgents.length > 0 ? [`${pausedAgents.length} paused agent${pausedAgents.length > 1 ? "s" : ""}`] : []),
    ],
    recommendations: [
      ...(overloaded.length > 0 ? ["Rebalance workload across agents"] : []),
      ...(pausedAgents.length > 0 ? ["Consider reactivating paused agents"] : []),
    ],
    relatedAlerts: [],
  });

  // Monthly review
  reviews.push({
    id: "review-monthly",
    type: "monthly",
    title: "Monthly Strategic Review",
    timestamp: now,
    summary: `Department alignment across Export-Growth, Ops-Improvement, Architecture-Systems. ${signals.length} signals detected.`,
    keyRisks: signals.filter((s) => s.severity === "high").map((s) => s.message),
    recommendations: signals.length > 0
      ? ["Address high-severity signals", "Review hiring recommendations"]
      : ["Strategic alignment is healthy"],
    relatedAlerts: [],
  });

  // Quarterly review
  reviews.push({
    id: "review-quarterly",
    type: "quarterly",
    title: "Quarterly Redesign Review",
    timestamp: now,
    summary: `Governance posture review. ${blockedTasks.length === 0 && unassignedTasks.length === 0 ? "System is ready for scaling." : "Structural adjustments needed before scaling."}`,
    keyRisks: blockedTasks.length >= 3 ? ["Execution stalled — redesign recommended"] : ["No redesign blockers"],
    recommendations: blockedTasks.length === 0
      ? ["System is stable for expansion"]
      : ["Resolve blockers before scaling operations"],
    relatedAlerts: [],
  });

  return reviews;
}

// ── Generate Recommended Actions ─────────────────────

export function generateRecommendedActions(
  tasks: TaskWithAgent[],
  agents: Agent[],
  signals: AutonomySignal[]
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const pausedAgents = agents.filter((a) => a.status === "paused");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const overloaded = agents.filter((a) =>
    tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length >= 5
  );

  // Activate paused agents
  for (const agent of pausedAgents) {
    actions.push({
      id: `action-activate-${agent.id}`,
      type: "activate_agent",
      title: `Activate ${agent.name}`,
      description: `${agent.name} is paused. Reactivating could reduce unassigned workload.`,
      urgency: unassignedTasks.length >= 3 ? "high" : "medium",
      relatedAgentId: agent.id,
    });
  }

  // Escalate blockers
  if (blockedTasks.length >= 3) {
    const highPriorityBlocked = blockedTasks.filter((t) => t.priority === "high");
    actions.push({
      id: "action-escalate-blockers",
      type: "escalate_blocker",
      title: "Escalate Blocked Tasks",
      description: `${blockedTasks.length} tasks blocked${highPriorityBlocked.length > 0 ? ` (${highPriorityBlocked.length} high priority)` : ""}. Immediate escalation recommended.`,
      urgency: "high",
      relatedTaskIds: blockedTasks.map((t) => t.id),
    });
  }

  // Rebalance workload
  if (overloaded.length > 0) {
    actions.push({
      id: "action-rebalance",
      type: "rebalance",
      title: "Rebalance Workload",
      description: `${overloaded.length} agent${overloaded.length > 1 ? "s" : ""} carrying 5+ tasks. Redistribute to improve throughput.`,
      urgency: "medium",
      relatedAgentId: undefined, // simplified((a) => a.id),
    });
  }

  // Assign unassigned
  if (unassignedTasks.length >= 2) {
    actions.push({
      id: "action-assign-unassigned",
      type: "rebalance",
      title: "Assign ${unassignedTasks.length} Unassigned Tasks",
      description: `${unassignedTasks.length} tasks have no agent. Route them to available capacity.`,
      urgency: unassignedTasks.length >= 4 ? "high" : "medium",
      relatedTaskIds: unassignedTasks.map((t) => t.id),
    });
  }

  return actions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.urgency] - order[b.urgency];
  });
}

// Re-export HiringRecommend type for deriveAutonomyState
type HiringRecommend = { id: string };
