import type { Project, Agent, TaskWithAgent, SpecialistType } from "@/types/dashboard";

// ── Types ────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

export interface PlanAgent {
  agent: Agent;
  matchScore: number;
  currentLoad: number;
  recommended: boolean;
  reason: string;
}

export interface PlanSpecialist {
  typeName: string;
  reason: string;
  urgency: "high" | "medium" | "low";
}

export interface PlanTask {
  title: string;
  category: "setup" | "execution" | "validation" | "reporting";
  priority: "high" | "medium" | "low";
  suggestedAgentId: string | null;
}

export interface ProjectPlan {
  department: string;
  departmentReason: string;
  agents: PlanAgent[];
  specialists: PlanSpecialist[];
  tasks: PlanTask[];
  riskLevel: RiskLevel;
  riskReason: string;
  capacitySignal: string;
}

// ── Department Matching ──────────────────────────────

const DEPT_KEYWORDS: Record<string, string[]> = {
  "Export-Growth": ["export", "sourcing", "buyer", "growth", "lead", "shipment", "supplier", "trade", "customs", "documentation", "follow-up", "order"],
  "Ops-Improvement": ["workflow", "blocker", "operation", "audit", "routine", "process", "automation", "improvement", "bottleneck", "efficiency", "sop", "quality"],
  "Architecture-Systems": ["system", "architecture", "dashboard", "infra", "app", "integration", "database", "api", "platform", "model", "design", "code", "deploy"],
};

function matchDepartment(title: string, objective: string, scope: string): { dept: string; reason: string } {
  const text = `${title} ${objective} ${scope}`.toLowerCase();
  const scores: Record<string, number> = { "Export-Growth": 0, "Ops-Improvement": 0, "Architecture-Systems": 0 };

  for (const [dept, keywords] of Object.entries(DEPT_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) scores[dept]++;
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  const second = sorted[1];

  if (best[1] === 0) {
    return { dept: "Architecture-Systems", reason: "No strong keyword match — defaulting to Architecture-Systems as general platform work." };
  }

  if (best[1] === second[1]) {
    return { dept: best[0], reason: `Tied match between ${best[0]} and ${second[0]}. Assigned to ${best[0]} as primary.` };
  }

  return {
    dept: best[0],
    reason: `Strong match: ${best[1]} keywords align with ${best[0]} domain.`,
  };
}

// ── Agent Matching ───────────────────────────────────

function matchAgents(
  dept: string,
  title: string,
  objective: string,
  agents: Agent[],
  tasks: TaskWithAgent[]
): PlanAgent[] {
  const deptKeyword = dept.toLowerCase().split("-")[0];
  const text = `${title} ${objective}`.toLowerCase();

  const results: PlanAgent[] = [];

  for (const agent of agents.filter((a) => a.status === "active")) {
    const openTasks = tasks.filter((t) => t.assigned_agent_id === agent.id && t.status !== "done").length;
    const agentDomain = agent.domain.toLowerCase();
    const agentName = agent.name.toLowerCase();

    let score = 0;
    let reasons: string[] = [];

    // Domain match
    if (agentDomain.includes(deptKeyword) || agentName.includes(deptKeyword)) {
      score += 3;
      reasons.push("domain match");
    }

    // Keyword overlap
    const domainWords = agentDomain.split(/[,\s]+/);
    for (const word of domainWords) {
      if (word.length > 3 && text.includes(word)) {
        score += 1;
      }
    }

    // Load penalty
    if (openTasks >= 5) {
      score -= 2;
      reasons.push("overloaded");
    } else if (openTasks <= 2) {
      score += 1;
      reasons.push("available capacity");
    }

    if (score > 0) {
      results.push({
        agent,
        matchScore: score,
        currentLoad: openTasks,
        recommended: score >= 3 && openTasks < 5,
        reason: reasons.join(", ") || "general match",
      });
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// ── Specialist Matching ──────────────────────────────

const SPECIALIST_RULES: Array<{ keywords: string[]; typeName: string; reason: string }> = [
  { keywords: ["ui", "ux", "design", "interface", "frontend", "component"], typeName: "UI/UX Systems Designer", reason: "UI/design work detected" },
  { keywords: ["integration", "api", "webhook", "connect", "sync"], typeName: "Architecture Reviewer", reason: "Integration/API work detected" },
  { keywords: ["analysis", "report", "metric", "kpi", "data", "dashboard"], typeName: "KPI & Governance Analyst", reason: "Analysis/reporting work detected" },
  { keywords: ["automation", "workflow", "process", "routine", "bot"], typeName: "Workflow Automation Specialist", reason: "Automation/workflow work detected" },
  { keywords: ["infra", "deploy", "server", "runtime", "system", "performance"], typeName: "Architecture Reviewer", reason: "Infrastructure/system work detected" },
  { keywords: ["export", "buyer", "sourcing", "supplier", "trade", "customs"], typeName: "Export Documentation Specialist", reason: "Export research/readiness work detected" },
  { keywords: ["audit", "risk", "compliance", "review", "quality", "issue"], typeName: "Data Quality Auditor", reason: "Ops issue/risk review detected" },
  { keywords: ["partnership", "collaboration", "stakeholder", "client"], typeName: "Partnership Concept Specialist", reason: "Partnership/collaboration work detected" },
];

function matchSpecialists(title: string, objective: string, scope: string): PlanSpecialist[] {
  const text = `${title} ${objective} ${scope}`.toLowerCase();
  const results: PlanSpecialist[] = [];
  const seen = new Set<string>();

  for (const rule of SPECIALIST_RULES) {
    if (seen.has(rule.typeName)) continue;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        results.push({
          typeName: rule.typeName,
          reason: rule.reason,
          urgency: rule.keywords.filter((k) => text.includes(k)).length >= 2 ? "medium" : "low",
        });
        seen.add(rule.typeName);
        break;
      }
    }
  }

  return results;
}

// ── Starter Task Generation ──────────────────────────

function generateStarterTasks(title: string, dept: string, agents: PlanAgent[]): PlanTask[] {
  const tasks: PlanTask[] = [];
  const bestAgent = agents.find((a) => a.recommended)?.agent;

  // Setup tasks
  tasks.push({
    title: `Define scope and requirements for ${title}`,
    category: "setup",
    priority: "high",
    suggestedAgentId: bestAgent?.id ?? null,
  });

  tasks.push({
    title: `Set up project workspace and documentation for ${title}`,
    category: "setup",
    priority: "medium",
    suggestedAgentId: bestAgent?.id ?? null,
  });

  // Execution tasks (department-specific)
  if (dept === "Export-Growth") {
    tasks.push(
      { title: "Identify target buyers and market segments", category: "execution", priority: "high", suggestedAgentId: bestAgent?.id ?? null },
      { title: "Prepare export documentation templates", category: "execution", priority: "medium", suggestedAgentId: bestAgent?.id ?? null },
    );
  } else if (dept === "Ops-Improvement") {
    tasks.push(
      { title: "Map current workflow and identify bottlenecks", category: "execution", priority: "high", suggestedAgentId: bestAgent?.id ?? null },
      { title: "Draft improved process SOPs", category: "execution", priority: "medium", suggestedAgentId: bestAgent?.id ?? null },
    );
  } else {
    tasks.push(
      { title: "Design system architecture and data model", category: "execution", priority: "high", suggestedAgentId: bestAgent?.id ?? null },
      { title: "Implement core components and integrations", category: "execution", priority: "high", suggestedAgentId: bestAgent?.id ?? null },
    );
  }

  // Validation
  tasks.push({
    title: `Validate deliverables against success criteria`,
    category: "validation",
    priority: "medium",
    suggestedAgentId: null,
  });

  // Reporting
  tasks.push({
    title: `Prepare project completion report for ${title}`,
    category: "reporting",
    priority: "low",
    suggestedAgentId: null,
  });

  return tasks;
}

// ── Risk Assessment ──────────────────────────────────

function assessRisk(
  project: Project,
  agents: PlanAgent[],
  tasks: PlanTask[]
): { level: RiskLevel; reason: string; capacity: string } {
  const hasRecommendedAgent = agents.some((a) => a.recommended);
  const overloadedAgents = agents.filter((a) => a.currentLoad >= 5);
  const highPriorityTasks = tasks.filter((t) => t.priority === "high").length;
  const noAgentTasks = tasks.filter((t) => !t.suggestedAgentId).length;

  if (!hasRecommendedAgent && agents.length === 0) {
    return { level: "high", reason: "No active agents match this project's domain. Staffing gap detected.", capacity: "Critical — no agents available" };
  }

  if (!hasRecommendedAgent) {
    return { level: "high", reason: "No well-matched agent available. Closest agents are overloaded or weakly matched.", capacity: "Limited — best agents overloaded" };
  }

  if (overloadedAgents.length >= 2) {
    return { level: "high", reason: "Multiple recommended agents are already overloaded (5+ tasks). Workload distribution needed.", capacity: "Strained — overloaded agents" };
  }

  if (noAgentTasks >= 3) {
    return { level: "medium", reason: `${noAgentTasks} tasks have no suitable agent assignment. Consider hiring or specialist support.`, capacity: "Moderate — partial coverage" };
  }

  if (highPriorityTasks >= 4) {
    return { level: "medium", reason: "High proportion of high-priority tasks. Execution pressure is elevated.", capacity: "Moderate — elevated priority load" };
  }

  return { level: "low", reason: "Good agent coverage, balanced priority distribution, no immediate staffing gaps.", capacity: "Healthy — good capacity" };
}

// ── Main Plan Generator ──────────────────────────────

export function generateProjectPlan(
  project: Project,
  agents: Agent[],
  tasks: TaskWithAgent[],
  specialistTypes: SpecialistType[]
): ProjectPlan {
  const dept = matchDepartment(project.title, project.objective ?? "", project.scope ?? "");
  const planAgents = matchAgents(dept.dept, project.title, project.objective ?? "", agents, tasks);
  const planSpecialists = matchSpecialists(project.title, project.objective ?? "", project.scope ?? "");
  const planTasks = generateStarterTasks(project.title, dept.dept, planAgents);
  const risk = assessRisk(project, planAgents, planTasks);

  return {
    department: dept.dept,
    departmentReason: dept.reason,
    agents: planAgents.slice(0, 5),
    specialists: planSpecialists,
    tasks: planTasks,
    riskLevel: risk.level,
    riskReason: risk.reason,
    capacitySignal: risk.capacity,
  };
}
