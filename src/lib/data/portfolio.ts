import type { ProjectWithStats, ProjectHealthScore, Department, Agent, TaskWithAgent } from "@/types/dashboard";
import { calculateProjectHealth } from "@/lib/data/governance";

// ── Types ────────────────────────────────────────────

export type PortfolioView = "status" | "department" | "priority" | "health";

export interface PortfolioStats {
  total: number;
  active: number;
  blocked: number;
  critical: number;
  completed: number;
  overdue: number;
  avgHealth: number;
}

export interface ExecutiveSignal {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  projectIds: string[];
}

export interface PortfolioReview {
  topRisks: string[];
  bottlenecks: string[];
  mostEfficientDept: string;
  projectsNeedingIntervention: string[];
  recommendedActions: string[];
  timestamp: string;
}

// ── Portfolio Stats ──────────────────────────────────

export function calculatePortfolioStats(
  projects: ProjectWithStats[],
  healthScores: Map<string, ProjectHealthScore>
): PortfolioStats {
  const now = new Date();
  const healthValues = [...healthScores.values()];

  return {
    total: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    blocked: projects.filter((p) => p.blocked_tasks > 0).length,
    critical: healthValues.filter((h) => h.status === "critical").length,
    completed: projects.filter((p) => p.status === "completed").length,
    overdue: projects.filter((p) => p.due_date && new Date(p.due_date) < now && p.status !== "completed").length,
    avgHealth: healthValues.length > 0
      ? Math.round(healthValues.reduce((sum, h) => sum + h.score, 0) / healthValues.length)
      : 0,
  };
}

// ── Executive Signals ────────────────────────────────

export function generateExecutiveSignals(
  projects: ProjectWithStats[],
  healthScores: Map<string, ProjectHealthScore>,
  agents: Agent[],
  tasks: TaskWithAgent[]
): ExecutiveSignal[] {
  const signals: ExecutiveSignal[] = [];
  const now = new Date();

  // Most blocked projects
  const blockedProjects = projects
    .filter((p) => p.blocked_tasks >= 2)
    .sort((a, b) => b.blocked_tasks - a.blocked_tasks);

  if (blockedProjects.length > 0) {
    signals.push({
      type: "blocked_projects",
      severity: blockedProjects.some((p) => p.blocked_tasks >= 4) ? "high" : "medium",
      message: `${blockedProjects.length} project(s) with 2+ blocked tasks — execution stalled`,
      projectIds: blockedProjects.map((p) => p.id),
    });
  }

  // Overdue projects
  const overdueProjects = projects.filter(
    (p) => p.due_date && new Date(p.due_date) < now && p.status !== "completed"
  );
  if (overdueProjects.length > 0) {
    signals.push({
      type: "overdue_projects",
      severity: "high",
      message: `${overdueProjects.length} project(s) past due date`,
      projectIds: overdueProjects.map((p) => p.id),
    });
  }

  // Inactive projects (no updates in 48h)
  const inactiveProjects = projects.filter((p) => {
    const hoursSince = (now.getTime() - new Date(p.updated_at).getTime()) / 3600000;
    return hoursSince > 48 && p.status === "active";
  });
  if (inactiveProjects.length > 0) {
    signals.push({
      type: "inactive_projects",
      severity: "medium",
      message: `${inactiveProjects.length} active project(s) with no updates in 48+ hours`,
      projectIds: inactiveProjects.map((p) => p.id),
    });
  }

  // Departments under stress
  const deptLoad = new Map<string, { tasks: number; blocked: number }>();
  for (const project of projects.filter((p) => p.status === "active")) {
    const existing = deptLoad.get(project.owner_department) ?? { tasks: 0, blocked: 0 };
    existing.tasks += project.open_tasks;
    existing.blocked += project.blocked_tasks;
    deptLoad.set(project.owner_department, existing);
  }

  for (const [dept, load] of deptLoad) {
    if (load.blocked >= 3 || load.tasks >= 10) {
      signals.push({
        type: "dept_stress",
        severity: load.blocked >= 5 ? "high" : "medium",
        message: `${dept} under stress — ${load.tasks} open tasks, ${load.blocked} blocked`,
        projectIds: [],
      });
    }
  }

  // Critical health projects
  const criticalProjects = projects.filter((p) => {
    const h = healthScores.get(p.id);
    return h?.status === "critical";
  });
  if (criticalProjects.length > 0) {
    signals.push({
      type: "critical_health",
      severity: "high",
      message: `${criticalProjects.length} project(s) at critical health — immediate intervention needed`,
      projectIds: criticalProjects.map((p) => p.id),
    });
  }

  // Hiring signals
  const pausedAgents = agents.filter((a) => a.status === "paused");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
  if (unassignedTasks.length >= 3 && pausedAgents.length === 0) {
    signals.push({
      type: "hiring_needed",
      severity: "medium",
      message: `${unassignedTasks.length} unassigned tasks and no paused agents available — hiring recommended`,
      projectIds: [],
    });
  }

  return signals.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

// ── Portfolio Review ─────────────────────────────────

export function generatePortfolioReview(
  projects: ProjectWithStats[],
  healthScores: Map<string, ProjectHealthScore>,
  signals: ExecutiveSignal[]
): PortfolioReview {
  const now = new Date();

  // Top risks
  const topRisks: string[] = [];
  const overdue = projects.filter((p) => p.due_date && new Date(p.due_date) < now && p.status !== "completed");
  if (overdue.length > 0) topRisks.push(`${overdue.length} project(s) overdue`);
  const critical = projects.filter((p) => healthScores.get(p.id)?.status === "critical");
  if (critical.length > 0) topRisks.push(`${critical.length} project(s) at critical health`);
  const highBlocked = projects.filter((p) => p.blocked_tasks >= 3);
  if (highBlocked.length > 0) topRisks.push(`${highBlocked.length} project(s) with 3+ blocked tasks`);

  // Bottlenecks
  const bottlenecks: string[] = [];
  const deptBlockers = new Map<string, number>();
  for (const p of projects) {
    const count = deptBlockers.get(p.owner_department) ?? 0;
    deptBlockers.set(p.owner_department, count + p.blocked_tasks);
  }
  for (const [dept, count] of deptBlockers) {
    if (count >= 3) bottlenecks.push(`${dept}: ${count} blocked tasks across projects`);
  }

  // Most efficient dept
  const deptCompletion = new Map<string, { total: number; done: number }>();
  for (const p of projects) {
    const existing = deptCompletion.get(p.owner_department) ?? { total: 0, done: 0 };
    existing.total += p.open_tasks + p.completed_tasks;
    existing.done += p.completed_tasks;
    deptCompletion.set(p.owner_department, existing);
  }
  let mostEfficientDept = "N/A";
  let bestRatio = 0;
  for (const [dept, stats] of deptCompletion) {
    const ratio = stats.total > 0 ? stats.done / stats.total : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      mostEfficientDept = dept;
    }
  }

  // Projects needing intervention
  const intervention = projects.filter((p) => {
    const h = healthScores.get(p.id);
    return h?.status === "critical" || h?.status === "at_risk";
  });

  // Recommended actions
  const recommendedActions: string[] = [];
  if (overdue.length > 0) recommendedActions.push("Review overdue projects and adjust timelines");
  if (critical.length > 0) recommendedActions.push("Intervene on critical health projects immediately");
  if (signals.some((s) => s.type === "hiring_needed")) recommendedActions.push("Open hiring for unassigned workload");
  if (bottlenecks.length > 0) recommendedActions.push("Rebalance workload across departments");
  if (recommendedActions.length === 0) recommendedActions.push("Maintain current course — portfolio is healthy");

  return {
    topRisks,
    bottlenecks,
    mostEfficientDept,
    projectsNeedingIntervention: intervention.map((p) => `${p.project_code}: ${p.title}`),
    recommendedActions,
    timestamp: new Date().toISOString(),
  };
}
