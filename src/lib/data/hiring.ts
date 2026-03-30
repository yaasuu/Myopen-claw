import type { Agent, TaskWithAgent } from "@/types/dashboard";

export type Urgency = "high" | "medium" | "low";

export type HiringAction = "hire_new" | "activate_existing" | "auto_assign";

export interface HiringRecommendation {
  id: string;
  suggestedName: string;
  suggestedEmoji: string;
  suggestedDomain: string;
  explanation: string;
  urgency: Urgency;
  matchedTaskCount: number;
  action: HiringAction;
  existingAgent?: Agent; // set if action is activate_existing
  matchedTaskIds: string[];
}

/**
 * Analyze tasks and agents to produce hiring recommendations.
 */
export function analyzeHiringNeeds(
  tasks: TaskWithAgent[],
  agents: Agent[]
): HiringRecommendation[] {
  const recommendations: HiringRecommendation[] = [];
  const activeAgents = agents.filter((a) => a.status === "active");
  const pausedAgents = agents.filter((a) => a.status === "paused");
  const unassignedTasks = tasks.filter((t) => !t.assigned_agent_id);
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const overdueTasks = tasks.filter((t) => {
    const age = Date.now() - new Date(t.created_at).getTime();
    return age > 72 * 3600000 && t.status !== "done"; // older than 3 days
  });

  // 1. Unassigned tasks cluster
  if (unassignedTasks.length >= 2) {
    const domains = extractDomains(unassignedTasks);
    recommendations.push({
      id: "rec-unassigned",
      suggestedName: `${domains[0] ?? "General"} Agent`,
      suggestedEmoji: "🆕",
      suggestedDomain: domains.join(", ") || "General operations",
      explanation: `${unassignedTasks.length} tasks have no assigned agent. A dedicated agent could own this workload.`,
      urgency: unassignedTasks.length >= 4 ? "high" : "medium",
      matchedTaskCount: unassignedTasks.length,
      action: "hire_new",
      matchedTaskIds: unassignedTasks.map((t) => t.id),
    });
  }

  // 2. Blocked tasks cluster
  if (blockedTasks.length >= 2) {
    const blockedUnassigned = blockedTasks.filter((t) => !t.assigned_agent_id);
    if (blockedUnassigned.length > 0) {
      recommendations.push({
        id: "rec-blocked",
        suggestedName: "Unblocker Agent",
        suggestedEmoji: "🔧",
        suggestedDomain: "Issue resolution, blocker clearing",
        explanation: `${blockedTasks.length} tasks are blocked, ${blockedUnassigned.length} with no agent. An agent dedicated to resolving blockers could improve flow.`,
        urgency: "high",
        matchedTaskCount: blockedTasks.length,
        action: "hire_new",
        matchedTaskIds: blockedTasks.map((t) => t.id),
      });
    }
  }

  // 3. Overdue tasks
  if (overdueTasks.length >= 3) {
    recommendations.push({
      id: "rec-overdue",
      suggestedName: "Catch-up Agent",
      suggestedEmoji: "⏰",
      suggestedDomain: "Backlog clearance, overdue task recovery",
      explanation: `${overdueTasks.length} tasks are older than 3 days and still not done. A focused agent could clear this backlog.`,
      urgency: "high",
      matchedTaskCount: overdueTasks.length,
      action: "hire_new",
      matchedTaskIds: overdueTasks.map((t) => t.id),
    });
  }

  // 4. Paused agent that matches current demand
  for (const paused of pausedAgents) {
    const matchingTasks = unassignedTasks.filter((t) => {
      // Match by domain keywords
      const domainWords = paused.domain.toLowerCase().split(/[,\s]+/);
      const titleWords = t.title.toLowerCase();
      return domainWords.some((w) => w.length > 3 && titleWords.includes(w));
    });

    if (matchingTasks.length >= 2) {
      recommendations.push({
        id: `rec-activate-${paused.id}`,
        suggestedName: paused.name,
        suggestedEmoji: paused.emoji,
        suggestedDomain: paused.domain,
        explanation: `${paused.name} is paused but ${matchingTasks.length} unassigned tasks match its domain. Reactivating this agent could immediately reduce the backlog.`,
        urgency: "medium",
        matchedTaskCount: matchingTasks.length,
        action: "activate_existing",
        existingAgent: paused,
        matchedTaskIds: matchingTasks.map((t) => t.id),
      });
    }
  }

  // 5. Overloaded agent (too many tasks in one domain)
  const agentTaskCounts = new Map<string, number>();
  for (const task of tasks.filter((t) => t.status !== "done" && t.assigned_agent_id)) {
    const count = agentTaskCounts.get(task.assigned_agent_id!) ?? 0;
    agentTaskCounts.set(task.assigned_agent_id!, count + 1);
  }

  for (const [agentId, count] of agentTaskCounts) {
    if (count >= 5) {
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        recommendations.push({
          id: `rec-relieve-${agent.id}`,
          suggestedName: `${agent.domain.split(",")[0]?.trim() || "Support"} Agent`,
          suggestedEmoji: "🤝",
          suggestedDomain: agent.domain,
          explanation: `${agent.name} has ${count} open tasks. A support agent could share the load in ${agent.domain}.`,
          urgency: count >= 8 ? "high" : "medium",
          matchedTaskCount: count,
          action: "hire_new",
          matchedTaskIds: tasks
            .filter((t) => t.assigned_agent_id === agentId && t.status !== "done")
            .map((t) => t.id),
        });
      }
    }
  }

  // 6. Simple auto-assign recommendation for unassigned tasks with active agents
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
      explanation: `${unassignedTasks.length} unassigned tasks could be distributed to ${bestAgent.name}, which currently has the fewest open tasks.`,
      urgency: "low",
      matchedTaskCount: unassignedTasks.length,
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

/**
 * Extract dominant keywords from task titles as domain suggestions.
 */
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

/**
 * Get unassigned tasks with weak assignment signals.
 */
export function getUnassignedTasks(tasks: TaskWithAgent[]): TaskWithAgent[] {
  return tasks.filter((t) => !t.assigned_agent_id && t.status !== "done");
}

/**
 * Get agent capacity snapshot.
 */
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
