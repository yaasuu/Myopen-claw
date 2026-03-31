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
  MilestoneStatus,
  ReviewType,
} from "@/types/dashboard";

// ── Health Score Calculator ──────────────────────────

export function calculateProjectHealth(
  project: Project,
  tasks: TaskWithAgent[],
  milestones: ProjectMilestone[]
): ProjectHealthScore {
  let score = 100;
  const factors: ProjectHealthScore["factors"] = [];

  // Task completion ratio
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const blockedTasks = tasks.filter((t) => t.status === "blocked").length;
  const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 1;

  if (completionRatio >= 0.75) {
    factors.push({ label: "Task completion", impact: `${Math.round(completionRatio * 100)}% complete`, severity: "good" });
  } else if (completionRatio >= 0.4) {
    factors.push({ label: "Task completion", impact: `${Math.round(completionRatio * 100)}% complete`, severity: "warn" });
    score -= 15;
  } else {
    factors.push({ label: "Task completion", impact: `Only ${Math.round(completionRatio * 100)}% complete`, severity: "bad" });
    score -= 30;
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
  const expectedProgress = completionRatio * 100;
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

  const escalationNeeded = status === "critical" || missedMilestones.length > 0 || (blockedTasks >= 3 && completionRatio < 0.3);
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
  return { data: (data ?? []) as ProjectReview[], error: null };
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
    source: "system",
    summary: `${input.reviewType} review generated for project`,
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
