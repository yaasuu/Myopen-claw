import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type {
  Project,
  ProjectMilestone,
  ProjectReview,
  ProjectDecision,
  ProjectHealthScore,
  ProjectHealth,
  TaskWithAgent,
  FeedEvent,
  MilestoneStatus,
  ReviewType,
} from "@/types/dashboard";

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeReview(review: Record<string, unknown>): ProjectReview {
  return {
    ...(review as ProjectReview),
    blockers: normalizeStringArray(review.blockers),
    decisions: normalizeStringArray(review.decisions),
    recommended_actions: normalizeStringArray(review.recommended_actions),
  };
}

// ── Health Score Calculator ──────────────────────────

export function calculateProjectHealth(
  project: Project,
  tasks: TaskWithAgent[],
  milestones: ProjectMilestone[],
  reviews: ProjectReview[] = []
): ProjectHealthScore {
  let score = 100;
  const factors: ProjectHealthScore["factors"] = [];

  // Task execution quality
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const approvedTasks = tasks.filter((t) => t.status === "approved").length;
  const submittedTasks = tasks.filter((t) => t.status === "submitted" || t.status === "in-review").length;
  const blockedTasks = tasks.filter((t) => t.status === "blocked").length;
  const executionScore = totalTasks > 0
    ? tasks.reduce((sum, task) => {
        const weights: Record<string, number> = {
          done: 1,
          approved: 0.9,
          "in-review": 0.75,
          submitted: 0.65,
          "in-progress": 0.45,
          dispatched: 0.25,
          pending: 0.15,
          rework: 0.1,
          blocked: 0,
        };
        return sum + (weights[task.status] ?? 0);
      }, 0) / totalTasks
    : 1;

  if (executionScore >= 0.75) {
    factors.push({ label: "Execution", impact: `${Math.round(executionScore * 100)}% workflow progress`, severity: "good" });
  } else if (executionScore >= 0.4) {
    factors.push({ label: "Execution", impact: `${Math.round(executionScore * 100)}% workflow progress`, severity: "warn" });
    score -= 15;
  } else {
    factors.push({ label: "Execution", impact: `Only ${Math.round(executionScore * 100)}% workflow progress`, severity: "bad" });
    score -= 30;
  }

  if (submittedTasks > 0 || approvedTasks > 0) {
    factors.push({
      label: "Review flow",
      impact: `${submittedTasks} submitted · ${approvedTasks} approved`,
      severity: approvedTasks > 0 ? "good" : submittedTasks > 0 ? "warn" : "good",
    });
  }

  // Blocked tasks
  if (blockedTasks === 0) {
    factors.push({ label: "Blockers", impact: "No blocked tasks", severity: "good" });
  } else if (blockedTasks <= 2) {
    factors.push({ label: "Blockers", impact: `${blockedTasks} blocked task(s)`, severity: "warn" });
    score -= 10;
  } else {
    factors.push({ label: "Blockers", impact: `${blockedTasks} blocked tasks — execution stalled`, severity: "bad" });
    score -= 25;
  }

  // Overdue milestones
  const now = new Date();
  const overdueMilestones = milestones.filter((m) => {
    if (m.status === "done" || !m.due_date) return false;
    return new Date(m.due_date) < now;
  });
  const missedMilestones = milestones.filter((m) => m.status === "missed");

  if (missedMilestones.length > 0) {
    factors.push({ label: "Milestones", impact: `${missedMilestones.length} milestone(s) missed`, severity: "bad" });
    score -= 20;
  } else if (overdueMilestones.length > 0) {
    factors.push({ label: "Milestones", impact: `${overdueMilestones.length} milestone(s) overdue`, severity: "warn" });
    score -= 10;
  } else if (milestones.length > 0) {
    factors.push({ label: "Milestones", impact: "On track", severity: "good" });
  }

  // Project due date
  if (project.due_date) {
    const dueDate = new Date(project.due_date);
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);

    if (project.status === "completed") {
      factors.push({ label: "Timeline", impact: "Completed", severity: "good" });
    } else if (daysUntilDue < 0) {
      factors.push({ label: "Timeline", impact: `${Math.abs(daysUntilDue)} days overdue`, severity: "bad" });
      score -= 25;
    } else if (daysUntilDue < 7) {
      factors.push({ label: "Timeline", impact: `${daysUntilDue} days remaining`, severity: "warn" });
      score -= 10;
    } else {
      factors.push({ label: "Timeline", impact: `${daysUntilDue} days remaining`, severity: "good" });
    }
  }

  // Review freshness
  const latestReview = reviews[0] ?? null;
  if (project.status === "active") {
    if (!latestReview) {
      factors.push({ label: "Governance", impact: "No project review logged yet", severity: "warn" });
      score -= 8;
    } else {
      const reviewAgeHours = (now.getTime() - new Date(latestReview.created_at).getTime()) / 3600000;
      const reviewBlockers = latestReview.blockers?.length ?? 0;
      if (reviewBlockers > 0) {
        factors.push({ label: "Latest review", impact: `${reviewBlockers} blocker(s) flagged`, severity: reviewBlockers >= 2 ? "bad" : "warn" });
        score -= reviewBlockers >= 2 ? 12 : 6;
      } else if (reviewAgeHours <= 168) {
        factors.push({ label: "Latest review", impact: "Recent review with no blockers", severity: "good" });
      }

      if (reviewAgeHours > 336) {
        factors.push({ label: "Review freshness", impact: `No review for ${Math.round(reviewAgeHours / 24)} days`, severity: "bad" });
        score -= 10;
      } else if (reviewAgeHours > 168) {
        factors.push({ label: "Review freshness", impact: `Last review ${Math.round(reviewAgeHours / 24)} days ago`, severity: "warn" });
        score -= 4;
      }
    }
  }

  // Inactivity
  const lastUpdate = new Date(project.updated_at);
  const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 3600000;
  if (hoursSinceUpdate > 72) {
    factors.push({ label: "Activity", impact: `No updates for ${Math.round(hoursSinceUpdate / 24)} days`, severity: "bad" });
    score -= 15;
  } else if (hoursSinceUpdate > 24) {
    factors.push({ label: "Activity", impact: `No updates for ${Math.round(hoursSinceUpdate)} hours`, severity: "warn" });
    score -= 5;
  }

  // Progress alignment
  const expectedProgress = executionScore * 100;
  const progressGap = project.progress - expectedProgress;
  if (progressGap < -20) {
    factors.push({ label: "Progress tracking", impact: "Reported progress behind actual completion", severity: "warn" });
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  let status: ProjectHealth;
  if (score >= 75) status = "healthy";
  else if (score >= 50) status = "watch";
  else if (score >= 25) status = "at_risk";
  else status = "critical";

  const escalationNeeded = status === "critical" || missedMilestones.length > 0 || (blockedTasks >= 3 && executionScore < 0.3);
  const escalationReason = escalationNeeded
    ? (status === "critical" ? "Project health is critical" :
       missedMilestones.length > 0 ? `${missedMilestones.length} milestone(s) missed` :
       "Multiple blockers with low completion rate")
    : "";

  return { score, status, factors, escalationNeeded, escalationReason };
}

// ── Mock Data ────────────────────────────────────────

const MOCK_MILESTONES: ProjectMilestone[] = [
  { id: "ms-1", project_id: "proj-1", title: "Dashboard MVP", due_date: "2026-04-01", status: "done", owner: "Architecture-Systems", notes: "Core dashboard with sidebar, overview, tasks page", sort_order: 1, created_at: "2026-03-28T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
  { id: "ms-2", project_id: "proj-1", title: "Auth + RBAC", due_date: "2026-04-05", status: "in_progress", owner: "Architecture-Systems", notes: "Login flow, middleware, admin/viewer roles", sort_order: 2, created_at: "2026-03-28T00:00:00Z", updated_at: new Date().toISOString() },
  { id: "ms-3", project_id: "proj-1", title: "Realtime + Notifications", due_date: "2026-04-10", status: "pending", owner: "Architecture-Systems", notes: "", sort_order: 3, created_at: "2026-03-28T00:00:00Z", updated_at: "2026-03-28T00:00:00Z" },
  { id: "ms-4", project_id: "proj-1", title: "Production Deploy", due_date: "2026-04-15", status: "pending", owner: "Architecture-Systems", notes: "", sort_order: 4, created_at: "2026-03-28T00:00:00Z", updated_at: "2026-03-28T00:00:00Z" },
];

const MOCK_REVIEWS: ProjectReview[] = [
  { id: "rv-1", project_id: "proj-1", review_type: "weekly", summary: "Strong progress on core dashboard. Auth implementation started. No critical blockers.", blockers: [], decisions: ["Adopted Supabase Auth with SSR cookie pattern"], recommended_actions: ["Complete auth flow testing", "Add notification center"], created_at: "2026-03-30T00:00:00Z" },
];

const MOCK_DECISIONS: ProjectDecision[] = [
  { id: "dc-1", project_id: "proj-1", title: "Use Supabase Auth", summary: "Adopted Supabase Auth with createBrowserClient for SSR cookie sync", decision_type: "technical", decided_by: "Yas", impact_level: "high", created_at: "2026-03-30T19:00:00Z" },
  { id: "dc-2", project_id: "proj-1", title: "Kanban as default view", summary: "Made board view the default task view instead of table", decision_type: "ux", decided_by: "Yas", impact_level: "medium", created_at: "2026-03-30T20:48:00Z" },
];

// ── Milestones ───────────────────────────────────────

export async function getProjectMilestones(projectId: string): Promise<{ data: ProjectMilestone[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_MILESTONES.filter((m) => m.project_id === projectId), error: null };

  const { data, error } = await supabase
    .from("project_milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ProjectMilestone[], error: null };
}

export async function createProjectMilestone(input: {
  projectId: string;
  title: string;
  dueDate?: string;
  owner?: string;
  notes?: string;
}): Promise<{ data: ProjectMilestone | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { count } = await supabase
    .from("project_milestones")
    .select("*", { count: "exact", head: true })
    .eq("project_id", input.projectId);

  const { data, error } = await supabase
    .from("project_milestones")
    .insert({
      project_id: input.projectId,
      title: input.title,
      due_date: input.dueDate ?? null,
      owner: input.owner ?? "",
      notes: input.notes ?? "",
      sort_order: (count ?? 0) + 1,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as ProjectMilestone, error: null };
}

export async function updateProjectMilestone(
  id: string,
  updates: Partial<Pick<ProjectMilestone, "title" | "due_date" | "status" | "owner" | "notes">>
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("project_milestones")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  return { error: error?.message ?? null };
}

// ── Reviews ──────────────────────────────────────────

export async function getProjectReviews(projectId: string): Promise<{ data: ProjectReview[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_REVIEWS.filter((r) => r.project_id === projectId), error: null };

  const { data, error } = await supabase
    .from("project_reviews")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((review) => normalizeReview(review as Record<string, unknown>)), error: null };
}

export async function createProjectReview(input: {
  projectId: string;
  reviewType: ReviewType;
  summary: string;
  blockers?: string[];
  decisions?: string[];
  recommendedActions?: string[];
}): Promise<{ data: ProjectReview | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("project_reviews")
    .insert({
      project_id: input.projectId,
      review_type: input.reviewType,
      summary: input.summary,
      blockers: input.blockers ?? [],
      decisions: input.decisions ?? [],
      recommended_actions: input.recommendedActions ?? [],
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await logFeedEvent({
    event_type: "governance_weekly_run",
    source: "Hermes Orchestrator",
    summary: `${input.reviewType} review generated for project ${input.projectId}`,
  });

  return { data: data as ProjectReview, error: null };
}

// ── Decisions ────────────────────────────────────────

export async function getProjectDecisions(projectId: string): Promise<{ data: ProjectDecision[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_DECISIONS.filter((d) => d.project_id === projectId), error: null };

  const { data, error } = await supabase
    .from("project_decisions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ProjectDecision[], error: null };
}

export async function createProjectDecision(input: {
  projectId: string;
  title: string;
  summary: string;
  decisionType?: string;
  decidedBy?: string;
  impactLevel?: "high" | "medium" | "low";
}): Promise<{ data: ProjectDecision | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("project_decisions")
    .insert({
      project_id: input.projectId,
      title: input.title,
      summary: input.summary,
      decision_type: input.decisionType ?? "general",
      decided_by: input.decidedBy ?? "Yas",
      impact_level: input.impactLevel ?? "medium",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as ProjectDecision, error: null };
}

// ─── Office Governance Signals ───

const BLOCKED_STALE_MS = 2 * 60 * 60 * 1000;   // 2 hours
const REVIEW_STALE_MS = 60 * 60 * 1000;         // 1 hour
const OVERLOAD_THRESHOLD = 5;                     // open tasks

export type Severity = "info" | "watch" | "attention" | "critical";

export interface GovernanceSignal {
  agentId: string;
  severity: Severity;
  kind: "blocked_stale" | "review_backlog" | "overloaded" | "rework_risk" | "skill_gap" | "needs_ceo";
  label: string;
  detail: string;
  jumpTo: string;
}

export interface OrchestratorGovernance {
  pendingReviews: number;
  blockedAgents: number;
  overloadedAgents: number;
  capabilityAlerts: number;
  needsAttention: number;
  signals: GovernanceSignal[];
}

function isStale(iso: string, windowMs: number): boolean {
  return Date.now() - new Date(iso).getTime() > windowMs;
}

export function computeAgentGovernanceSignals(
  agent: { id: string },
  tasks: TaskWithAgent[],
  reviewOutcomes: { task_id: string; outcome: string }[],
  capabilityGaps: { agent_id: string | null; urgency_level: string; composite_score: number }[]
): GovernanceSignal[] {
  const signals: GovernanceSignal[] = [];
  const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const openTasks = agentTasks.filter((t) => t.status !== "done");
  const blockedTasks = agentTasks.filter((t) => t.status === "blocked");
  const inReviewTasks = agentTasks.filter((t) => t.status === "in-review");

  for (const task of blockedTasks) {
    if (isStale(task.updated_at, BLOCKED_STALE_MS)) {
      signals.push({ agentId: agent.id, severity: "attention", kind: "blocked_stale", label: "Blocked too long", detail: task.blocker ?? "No reason", jumpTo: "/tasks" });
    }
  }

  for (const task of inReviewTasks) {
    if (isStale(task.updated_at, REVIEW_STALE_MS)) {
      signals.push({ agentId: agent.id, severity: "watch", kind: "review_backlog", label: "Review waiting", detail: `Task "${task.title}" awaiting review`, jumpTo: "/reviews" });
    }
  }

  if (openTasks.length >= OVERLOAD_THRESHOLD) {
    signals.push({ agentId: agent.id, severity: openTasks.length >= 7 ? "attention" : "watch", kind: "overloaded", label: "Overloaded", detail: `${openTasks.length} open tasks`, jumpTo: `/agents/${agent.id}` });
  }

  const agentReviewTaskIds = new Set(agentTasks.map((t) => t.id));
  const rejections = reviewOutcomes.filter((r) => agentReviewTaskIds.has(r.task_id) && (r.outcome === "rejected" || r.outcome === "returned_for_rework"));
  if (rejections.length >= 2) {
    signals.push({ agentId: agent.id, severity: "attention", kind: "rework_risk", label: "Rework risk", detail: `${rejections.length} recent rejections`, jumpTo: "/reviews" });
  }

  const agentGaps = capabilityGaps.filter((g) => g.agent_id === agent.id);
  for (const gap of agentGaps) {
    if (gap.composite_score >= 3.0) {
      signals.push({ agentId: agent.id, severity: gap.composite_score >= 4.0 ? "critical" : "attention", kind: "skill_gap", label: "Skill gap", detail: `Score: ${gap.composite_score}`, jumpTo: "/learning" });
    }
  }

  if (blockedTasks.some((t) => t.priority === "high" && isStale(t.updated_at, BLOCKED_STALE_MS))) {
    signals.push({ agentId: agent.id, severity: "critical", kind: "needs_ceo", label: "Needs CEO attention", detail: "High-priority task blocked too long", jumpTo: "/tasks" });
  }

  return signals;
}

export function computeOrchestratorGovernance(
  agents: { id: string }[],
  tasks: TaskWithAgent[],
  _feedEvents: FeedEvent[],
  reviewOutcomes: { task_id: string; outcome: string }[],
  capabilityGaps: { agent_id: string | null; urgency_level: string; composite_score: number }[]
): OrchestratorGovernance {
  const allSignals: GovernanceSignal[] = [];
  for (const agent of agents) {
    allSignals.push(...computeAgentGovernanceSignals(agent, tasks, reviewOutcomes, capabilityGaps));
  }

  const pendingReviews = tasks.filter((t) => t.status === "in-review").length;
  const blockedAgents = new Set(tasks.filter((t) => t.status === "blocked").map((t) => t.assigned_agent_id)).size;
  const overloadedAgents = agents.filter((a) => tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length >= OVERLOAD_THRESHOLD).length;
  const capabilityAlerts = capabilityGaps.filter((g) => g.composite_score >= 3.0).length;
  const needsAttention = allSignals.filter((s) => s.severity === "critical" || s.severity === "attention").length;

  return { pendingReviews, blockedAgents, overloadedAgents, capabilityAlerts, needsAttention, signals: allSignals };
}
