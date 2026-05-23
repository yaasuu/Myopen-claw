import type { Agent, TaskWithAgent } from "@/types/dashboard";

export type Urgency = "high" | "medium" | "low";

export type HiringAction = "hire_new" | "activate_existing" | "auto_assign" | "dismiss";

export interface HiringRecommendation {
  id: string;
  suggestedName: string;
  suggestedEmoji: string;
  suggestedDomain: string;
  department: string;
  explanation: string;
  urgency: Urgency;
  matchedTaskCount: number;
  blockedTaskCount: number;
  action: HiringAction;
  existingAgent?: Agent;
  matchedTaskIds: string[];
}

// Yas Claw persistent departments
const DEPARTMENTS: Record<string, string> = {
  export: "Export-Growth",
  growth: "Export-Growth",
  buyer: "Export-Growth",
  supplier: "Export-Growth",
  shipment: "Export-Growth",
  lead: "Export-Growth",
  ops: "Ops-Improvement",
  workflow: "Ops-Improvement",
  process: "Ops-Improvement",
  routine: "Ops-Improvement",
  architecture: "Architecture-Systems",
  system: "Architecture-Systems",
  data: "Architecture-Systems",
  platform: "Architecture-Systems",
  model: "Architecture-Systems",
};

function matchDepartment(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, dept] of Object.entries(DEPARTMENTS)) {
    if (lower.includes(keyword)) return dept;
  }
  return "General";
}

export function analyzeHiringNeeds(
  tasks: TaskWithAgent[],
  agents: Agent[]
): HiringRecommendation[] {
  const recommendations: HiringRecommendation[] = [];
  const activeAgents = agents.filter((a) => a.status === "active");
  const pausedAgents = agents.filter((a) => a.status === "paused");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const overdueTasks = tasks.filter((t) => {
    const age = Date.now() - new Date(t.created_at).getTime();
    return age > 72 * 3600000 && t.status !== "done";
  });

  // 1. Unassigned tasks cluster
  if (unassignedTasks.length >= 2) {
    const keywords = extractDomains(unassignedTasks);
    const dept = matchDepartment(unassignedTasks.map((t) => t.title).join(" "));
    const blockedCount = unassignedTasks.filter((t) => t.status === "blocked").length;
    recommendations.push({
      id: "rec-unassigned",
      suggestedName: `${dept} Agent`,
      suggestedEmoji: dept === "Export-Growth" ? "📦" : dept === "Ops-Improvement" ? "⚙️" : dept === "Architecture-Systems" ? "🏗️" : "🆕",
      suggestedDomain: keywords.join(", ") || "General operations",
      department: dept,
      explanation: `${unassignedTasks.length} tasks have no assigned agent. A dedicated ${dept} agent could own this workload and reduce orphaned work.`,
      urgency: unassignedTasks.length >= 4 ? "high" : blockedCount > 0 ? "high" : "medium",
      matchedTaskCount: unassignedTasks.length,
      blockedTaskCount: blockedCount,
      action: "hire_new",
      matchedTaskIds: unassignedTasks.map((t) => t.id),
    });
  }

  // 2. Blocked tasks cluster (high priority)
  const blockedUnassigned = blockedTasks.filter((t) => !t.assigned_agent_id);
  if (blockedTasks.length >= 2 && blockedUnassigned.length > 0) {
    recommendations.push({
      id: "rec-blocked",
      suggestedName: "Unblocker Agent",
      suggestedEmoji: "🔧",
      suggestedDomain: "Issue resolution, blocker clearing",
      department: "Ops-Improvement",
      explanation: `${blockedTasks.length} tasks are blocked, ${blockedUnassigned.length} with no agent assigned. An agent focused on resolving blockers could unstick this pipeline.`,
      urgency: "high",
      matchedTaskCount: blockedTasks.length,
      blockedTaskCount: blockedTasks.length,
      action: "hire_new",
      matchedTaskIds: blockedTasks.map((t) => t.id),
    });
  }

  // 3. Overdue tasks
  if (overdueTasks.length >= 3) {
    const dept = matchDepartment(overdueTasks.map((t) => t.title).join(" "));
    recommendations.push({
      id: "rec-overdue",
      suggestedName: "Catch-up Agent",
      suggestedEmoji: "⏰",
      suggestedDomain: "Backlog clearance, overdue task recovery",
      department: dept,
      explanation: `${overdueTasks.length} tasks are older than 3 days and still not done. A focused recovery agent could clear this backlog.`,
      urgency: "high",
      matchedTaskCount: overdueTasks.length,
      blockedTaskCount: overdueTasks.filter((t) => t.status === "blocked").length,
      action: "hire_new",
      matchedTaskIds: overdueTasks.map((t) => t.id),
    });
  }

  // 4. Paused agent matching current demand (prioritize activation)
  for (const paused of pausedAgents) {
    const matchingTasks = unassignedTasks.filter((t) => {
      const domainWords = paused.domain.toLowerCase().split(/[,\s]+/);
      const titleWords = t.title.toLowerCase();
      return domainWords.some((w) => w.length > 3 && titleWords.includes(w));
    });

    if (matchingTasks.length >= 2) {
      const blockedCount = matchingTasks.filter((t) => t.status === "blocked").length;
      recommendations.push({
        id: `rec-activate-${paused.id}`,
        suggestedName: paused.name,
        suggestedEmoji: paused.emoji,
        suggestedDomain: paused.domain,
        department: matchDepartment(paused.domain),
        explanation: `${paused.name} is paused but ${matchingTasks.length} unassigned tasks match its domain. Reactivating would immediately reduce the backlog.`,
        urgency: blockedCount > 0 ? "high" : "medium",
        matchedTaskCount: matchingTasks.length,
        blockedTaskCount: blockedCount,
        action: "activate_existing",
        existingAgent: paused,
        matchedTaskIds: matchingTasks.map((t) => t.id),
      });
    }
  }

  // 5. Overloaded agent
  const agentTaskCounts = new Map<string, number>();
  for (const task of tasks.filter((t) => t.status !== "done" && t.assigned_agent_id)) {
    const count = agentTaskCounts.get(task.assigned_agent_id!) ?? 0;
    agentTaskCounts.set(task.assigned_agent_id!, count + 1);
  }

  for (const [agentId, count] of agentTaskCounts) {
    if (count >= 5) {
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        const agentOpenTasks = tasks.filter(
          (t) => t.assigned_agent_id === agentId && t.status !== "done"
        );
        recommendations.push({
          id: `rec-relieve-${agent.id}`,
          suggestedName: `${(agent.domain.split(",")[0]?.trim() || "Support").split(/[-\s]+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Agent`,
          suggestedEmoji: "🤝",
          suggestedDomain: agent.domain,
          department: matchDepartment(agent.domain),
          explanation: `${agent.name} has ${count} open tasks. A support agent could share the load in ${agent.domain}.`,
          urgency: count >= 8 ? "high" : "medium",
          matchedTaskCount: count,
          blockedTaskCount: agentOpenTasks.filter((t) => t.status === "blocked").length,
          action: "hire_new",
          matchedTaskIds: agentOpenTasks.map((t) => t.id),
        });
      }
    }
  }

  // 6. Auto-assign recommendation
  if (unassignedTasks.length > 0 && activeAgents.length > 0) {
    const bestAgent = activeAgents.reduce((best, a) => {
      const bestCount = agentTaskCounts.get(best.id) ?? 0;
      const aCount = agentTaskCounts.get(a.id) ?? 0;
      return aCount < bestCount ? a : best;
    });

    recommendations.push({
      id: "rec-auto-assign",
      suggestedName: bestAgent.name,
      suggestedEmoji: bestAgent.emoji,
      suggestedDomain: bestAgent.domain,
      department: matchDepartment(bestAgent.domain),
      explanation: `${unassignedTasks.length} unassigned tasks could be distributed to ${bestAgent.name}, which currently has the fewest open tasks.`,
      urgency: "low",
      matchedTaskCount: unassignedTasks.length,
      blockedTaskCount: unassignedTasks.filter((t) => t.status === "blocked").length,
      action: "auto_assign",
      existingAgent: bestAgent,
      matchedTaskIds: unassignedTasks.map((t) => t.id),
    });
  }

  return recommendations.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}

function extractDomains(tasks: TaskWithAgent[]): string[] {
  const words = new Map<string, number>();
  const stopWords = new Set(["the", "and", "for", "with", "this", "that", "from", "have", "been", "will", "are", "task", "review", "check"]);

  for (const task of tasks) {
    for (const word of task.title.toLowerCase().split(/\s+/)) {
      if (word.length > 3 && !stopWords.has(word)) {
        words.set(word, (words.get(word) ?? 0) + 1);
      }
    }
  }

  return [...words.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}

export function getUnassignedTasks(tasks: TaskWithAgent[]): TaskWithAgent[] {
  return tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
}

export function getAgentCapacity(
  tasks: TaskWithAgent[],
  agents: Agent[]
): Array<{
  agent: Agent;
  openTasks: number;
  blockedTasks: number;
  load: "light" | "moderate" | "heavy";
}> {
  return agents.map((agent) => {
    const agentTasks = tasks.filter(
      (t) => t.assigned_agent_id === agent.id && t.status !== "done"
    );
    const open = agentTasks.length;
    const blocked = agentTasks.filter((t) => t.status === "blocked").length;

    return {
      agent,
      openTasks: open,
      blockedTasks: blocked,
      load: open >= 6 ? "heavy" : open >= 3 ? "moderate" : "light",
    };
  });
}
