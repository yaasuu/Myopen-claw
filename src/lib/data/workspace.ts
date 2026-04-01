import { getSupabase } from "@/lib/supabase/client";
import type { Agent, TaskWithAgent, WorkspaceFile, AgentWorkspace } from "@/types/dashboard";

const AGENT_SOUL: Record<string, string> = {
  "yas-claw": `# Yas Claw — Soul\n\n## Identity\n- **Name:** Yas Claw\n- **Role:** CEO / Orchestrator\n- **Domain:** Orchestration, task management, agent coordination\n\n## Mission\nOrchestrate the entire system. Receive work from Yas, route to the right agent, monitor execution, approve completions.\n\n## Operating Rules\n- Always clarify before routing\n- Monitor agent workload and rebalance\n- Flag blockers immediately\n- Keep Yas informed of critical issues`,
  "export-growth": `# Export-Growth Agent — Soul\n\n## Identity\n- **Name:** Export-Growth Agent\n- **Role:** Export Specialist\n- **Domain:** Export execution, lead generation, buyer follow-up\n\n## Mission\nDrive export execution by managing leads, following up with buyers, preparing documentation.\n\n## Operating Rules\n- Prioritize high-value buyer relationships\n- Flag blockers immediately\n- Keep documentation current`,
  "ops-improvement": `# Ops-Improvement Agent — Soul\n\n## Identity\n- **Name:** Ops-Improvement Agent\n- **Role:** Operations Specialist\n- **Domain:** Workflows, process improvement, routines\n\n## Mission\nImprove operational efficiency by analyzing workflows, identifying bottlenecks, implementing automation.\n\n## Operating Rules\n- Map current state before proposing changes\n- Propose improvements with clear metrics\n- Document SOPs for all new processes`,
  "architecture-systems": `# Architecture-Systems Agent — Soul\n\n## Identity\n- **Name:** Architecture-Systems Agent\n- **Role:** Architecture Specialist\n- **Domain:** Platform design, data modeling, system architecture\n\n## Mission\nDesign and build technical infrastructure. Focus on clean architecture, scalable data models, reliable integrations.\n\n## Operating Rules\n- Design before building\n- Document architectural decisions\n- Test before deploying`,
};

const AGENT_MEMORY: Record<string, string> = {
  "yas-claw": `# Yas Claw — Memory\n\n## Recent Decisions\n- Adopted Supabase SSR auth pattern\n- Made kanban board default task view\n- Added Security Auditor for skill approval\n- Set 2 skills/month quota per agent\n\n## Operating Patterns\n- Create tasks via orchestrator API before working\n- Update status in-progress → done\n- Log feed events for all major actions`,
  "export-growth": `# Export-Growth Agent — Memory\n\n## Recent Activity\n- Managing export pipeline automation project\n- Buyer follow-up workflows in progress\n- Documentation templates being developed`,
  "ops-improvement": `# Ops-Improvement Agent — Memory\n\n## Recent Activity\n- Workflow redesign project active\n- Process bottlenecks identified in weekly review\n- SOPs being documented for key workflows`,
  "architecture-systems": `# Architecture-Systems Agent — Memory\n\n## Recent Activity\n- Building Mission Control dashboard\n- Auth system implemented\n- Task board with kanban view completed\n- Realtime subscriptions active`,
};

export function getAgentWorkspace(
  agent: Agent,
  tasks: TaskWithAgent[]
): AgentWorkspace {
  const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const key = agent.short_id;

  return {
    agent,
    soul: AGENT_SOUL[key] || `No SOUL.md defined for ${agent.name}`,
    memory: AGENT_MEMORY[key] || `No MEMORY.md defined for ${agent.name}`,
    skills: `Skills available for ${agent.name}. See /skills page for details.`,
    heartbeat: `Heartbeat configured for ${agent.name}. Hourly task review active.`,
    openTasks: agentTasks.filter((t) => t.status !== "done").length,
    blockedTasks: agentTasks.filter((t) => t.status === "blocked").length,
    completedTasks: agentTasks.filter((t) => t.status === "done").length,
  };
}

export function getWorkspaceFiles(workspace: AgentWorkspace): WorkspaceFile[] {
  return [
    { name: "SOUL.md", label: "Soul", content: workspace.soul, icon: "🧠" },
    { name: "MEMORY.md", label: "Memory", content: workspace.memory, icon: "💾" },
    { name: "SKILLS.md", label: "Skills", content: workspace.skills, icon: "⚡" },
    { name: "HEARTBEAT.md", label: "Heartbeat", content: workspace.heartbeat, icon: "💓" },
  ];
}
