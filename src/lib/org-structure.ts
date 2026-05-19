import type { Agent, Department } from "@/types/dashboard";

export const DIRECT_AGENT_SHORT_IDS = ["research-agent", "executive-finance", "qa-agent"] as const;

export const AGENT_DEPT_MAP: Record<string, string> = {
  "export-growth": "export-growth",
  "ops-improvement": "ops-improvement",
  "architecture-systems": "architecture-systems",
  "ui-ux-designer": "architecture-systems",
  "data-analyst": "ops-improvement",
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getDepartmentShortId(dept: Department): string {
  return normalize(dept.short_id || dept.name);
}

export function getAgentDepartmentId(agent: Agent, departments: Department[]): string | undefined {
  const targetShortId = AGENT_DEPT_MAP[agent.short_id];
  if (!targetShortId) return undefined;
  return departments.find((dept) => getDepartmentShortId(dept) === targetShortId)?.id;
}

export function buildDepartmentAgentMap(agents: Agent[], departments: Department[]): Map<string, Agent[]> {
  const map = new Map<string, Agent[]>();
  for (const dept of departments) {
    map.set(
      dept.id,
      agents.filter(
        (agent) =>
          !DIRECT_AGENT_SHORT_IDS.includes(agent.short_id as (typeof DIRECT_AGENT_SHORT_IDS)[number]) &&
          getAgentDepartmentId(agent, departments) === dept.id
      )
    );
  }
  return map;
}

export function buildOrgStructure(agents: Agent[], departments: Department[]) {
  const directAgents = agents.filter((agent) => DIRECT_AGENT_SHORT_IDS.includes(agent.short_id as (typeof DIRECT_AGENT_SHORT_IDS)[number]));
  const departmentAgents = buildDepartmentAgentMap(agents, departments);

  const assignedIds = new Set<string>();
  Array.from(departmentAgents.values()).forEach((items) => {
    items.forEach((agent) => assignedIds.add(agent.id));
  });
  directAgents.forEach((agent) => assignedIds.add(agent.id));

  const unassignedAgents = agents.filter((agent) => !assignedIds.has(agent.id));

  return {
    directAgents,
    departmentAgents,
    unassignedAgents,
  };
}
