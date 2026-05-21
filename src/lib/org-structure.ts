import type { Agent, Department } from "@/types/dashboard";

// No agents are direct reports — all belong to departments
export const DIRECT_AGENT_SHORT_IDS: readonly string[] = [];

// Maps agent short_id → department slug
export const AGENT_DEPT_MAP: Record<string, string> = {
  "export-coo-agent": "export-operations",
  "shipment-readiness-agent": "export-operations",
  "research-agent": "intelligence-research",
  "data-analyst": "intelligence-research",
  "executive-finance": "intelligence-research",
  "ops-improvement": "intelligence-research",
  "architecture-systems": "systems-quality",
  "ui-ux-designer": "systems-quality",
  "qa-agent": "systems-quality",
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getDepartmentShortId(dept: Department): string {
  return normalize(dept.slug || dept.short_id || dept.name);
}

export function getAgentDepartmentId(
  agent: Agent,
  departments: Department[]
): string | undefined {
  const targetSlug = AGENT_DEPT_MAP[agent.short_id];
  if (!targetSlug) return undefined;
  return departments.find(
    (dept) => getDepartmentShortId(dept) === targetSlug
  )?.id;
}

export function buildDepartmentAgentMap(
  agents: Agent[],
  departments: Department[]
): Map<string, Agent[]> {
  const map = new Map<string, Agent[]>();
  for (const dept of departments) {
    map.set(
      dept.id,
      agents.filter(
        (agent) =>
          agent.status === "active" &&
          getAgentDepartmentId(agent, departments) === dept.id
      )
    );
  }
  return map;
}

export function buildOrgStructure(
  agents: Agent[],
  departments: Department[]
) {
  const activeAgents = agents.filter((a) => a.status === "active");
  const activeDepts = departments.filter((d) => d.status === "active");

  const departmentAgents = buildDepartmentAgentMap(activeAgents, activeDepts);

  const assignedIds = new Set<string>();
  Array.from(departmentAgents.values()).forEach((items) => {
    items.forEach((agent) => assignedIds.add(agent.id));
  });

  const unassignedAgents = activeAgents.filter(
    (agent) => !assignedIds.has(agent.id)
  );

  const directAgents: Agent[] = [];

  return {
    directAgents,
    departmentAgents,
    unassignedAgents,
  };
}
