import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type { Department, Specialist, SpecialistType, TaskWithAgent, Agent } from "@/types/dashboard";

// ── Mock Data ────────────────────────────────────────

const MOCK_DEPARTMENTS: Department[] = [
  {
    id: "dept-1",
    name: "Export-Growth",
    short_id: "export-growth",
    slug: "export-growth",
    emoji: "📦",
    mandate: "Drive export execution, lead generation, and buyer follow-up",
    domain: "Export execution, lead generation, buyer follow-up, shipment planning",
    status: "active",
    priority: "high",
    agent_count: 1,
    created_at: "2026-03-28T00:00:00Z",
  },
  {
    id: "dept-2",
    name: "Ops-Improvement",
    short_id: "ops-improvement",
    slug: "ops-improvement",
    emoji: "⚙️",
    mandate: "Improve workflows, processes, routines, and operational clarity",
    domain: "Workflows, process improvement, routines, automation",
    status: "active",
    priority: "high",
    agent_count: 1,
    created_at: "2026-03-28T00:00:00Z",
  },
  {
    id: "dept-3",
    name: "Architecture-Systems",
    short_id: "architecture-systems",
    slug: "architecture-systems",
    emoji: "🏗️",
    mandate: "Design platform architecture, data models, and system structure",
    domain: "Platform design, data modeling, system architecture, integration",
    status: "active",
    priority: "medium",
    agent_count: 1,
    created_at: "2026-03-28T00:00:00Z",
  },
];

const MOCK_SPECIALIST_TYPES: SpecialistType[] = [
  { id: "st-1", name: "Export Documentation Specialist", category: "Export-Growth", description: "Handles export documentation, customs, and compliance", spawn_count: 3, last_spawned: new Date(Date.now() - 48 * 3600000).toISOString() },
  { id: "st-2", name: "Buyer Follow-up Specialist", category: "Export-Growth", description: "Manages buyer communication and follow-up cycles", spawn_count: 5, last_spawned: new Date(Date.now() - 24 * 3600000).toISOString() },
  { id: "st-3", name: "Ops Bottleneck Analyst", category: "Ops-Improvement", description: "Identifies and resolves operational bottlenecks", spawn_count: 2, last_spawned: new Date(Date.now() - 72 * 3600000).toISOString() },
  { id: "st-4", name: "Workflow Automation Specialist", category: "Ops-Improvement", description: "Designs and implements workflow automations", spawn_count: 1, last_spawned: null },
  { id: "st-5", name: "Architecture Reviewer", category: "Architecture-Systems", description: "Reviews system architecture and proposes improvements", spawn_count: 0, last_spawned: null },
  { id: "st-6", name: "UI/UX Systems Designer", category: "Architecture-Systems", description: "Designs user interfaces and system interaction patterns", spawn_count: 2, last_spawned: new Date(Date.now() - 96 * 3600000).toISOString() },
  { id: "st-7", name: "Sourcing Intelligence Specialist", category: "Export-Growth", description: "Researches suppliers, markets, and sourcing opportunities", spawn_count: 0, last_spawned: null },
  { id: "st-8", name: "Data Quality Auditor", category: "Ops-Improvement", description: "Audits data quality and proposes corrections", spawn_count: 1, last_spawned: new Date(Date.now() - 120 * 3600000).toISOString() },
  { id: "st-9", name: "KPI & Governance Analyst", category: "Ops-Improvement", description: "Tracks KPIs and governance compliance", spawn_count: 0, last_spawned: null },
  { id: "st-10", name: "Partnership Concept Specialist", category: "Export-Growth", description: "Develops partnership and collaboration frameworks", spawn_count: 1, last_spawned: new Date(Date.now() - 168 * 3600000).toISOString() },
  { id: "st-11", name: "Credit / Risk Structuring Specialist", category: "Export-Growth", description: "Structures credit terms and risk assessment", spawn_count: 0, last_spawned: null },
];

const MOCK_SPECIALISTS: Specialist[] = [
  {
    id: "spec-1",
    name: "Buyer Follow-up Specialist #1",
    type: "Buyer Follow-up Specialist",
    mission: "Follow up with Acme Corp on pending order confirmation",
    status: "active",
    department_id: "dept-1",
    assigned_task_id: null,
    spawn_source: "auto — blocked task detection",
    started_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    ended_at: null,
    output_summary: null,
  },
  {
    id: "spec-2",
    name: "Ops Bottleneck Analyst #1",
    type: "Ops Bottleneck Analyst",
    mission: "Analyze workflow bottlenecks in weekly review cycle",
    status: "completed",
    department_id: "dept-2",
    assigned_task_id: null,
    spawn_source: "manual — CEO request",
    started_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    ended_at: new Date(Date.now() - 48 * 3600000).toISOString(),
    output_summary: "Identified 3 bottlenecks: approval delays, duplicate data entry, unclear ownership on supplier tasks.",
  },
];

// ── Department CRUD ──────────────────────────────────

export async function getDepartments(): Promise<{ data: Department[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_DEPARTMENTS, error: null };

  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Department[], error: null };
}

export async function getDepartmentById(id: string): Promise<{ data: Department | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    const dept = MOCK_DEPARTMENTS.find((d) => d.id === id);
    return { data: dept ?? null, error: dept ? null : "Department not found" };
  }

  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Department not found" };
  return { data: data as Department, error: null };
}

export async function updateDepartmentStatus(
  id: string,
  status: "active" | "paused"
): Promise<{ data: Department | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("departments")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const dept = data as Department;
  await logFeedEvent({
    event_type: status === "paused" ? "department_paused" : "department_resumed",
    source: "system",
    summary: `Department '${dept.name}' ${status === "paused" ? "paused" : "resumed"}`,
  });

  return { data: dept, error: null };
}

export async function updateDepartmentProfile(
  id: string,
  updates: Partial<Pick<Department, "name" | "emoji" | "mandate" | "domain" | "priority">>
): Promise<{ data: Department | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("departments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await logFeedEvent({
    event_type: "department_updated",
    source: "system",
    summary: `Department profile updated`,
  });

  return { data: data as Department, error: null };
}

// ── Specialists ──────────────────────────────────────

export async function getSpecialists(options?: {
  status?: string;
}): Promise<{ data: Specialist[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    let data = MOCK_SPECIALISTS;
    if (options?.status) data = data.filter((s) => s.status === options.status);
    return { data, error: null };
  }

  let query = supabase.from("specialists").select("*").order("started_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Specialist[], error: null };
}

export async function getSpecialistTypes(): Promise<{ data: SpecialistType[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_SPECIALIST_TYPES, error: null };

  const { data, error } = await supabase
    .from("specialist_types")
    .select("*")
    .order("spawn_count", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as SpecialistType[], error: null };
}

export async function spawnSpecialist(input: {
  name: string;
  type: string;
  mission: string;
  departmentId?: string | null;
  taskId?: string | null;
  spawnSource?: string;
}): Promise<{ data: Specialist | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("specialists")
    .insert({
      name: input.name,
      type: input.type,
      mission: input.mission,
      department_id: input.departmentId ?? null,
      assigned_task_id: input.taskId ?? null,
      spawn_source: input.spawnSource ?? "manual",
      status: "active",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const specialist = data as Specialist;

  // Increment spawn count
  await supabase
    .from("specialist_types")
    .update({
      last_spawned: new Date().toISOString(),
    })
    .eq("name", input.type);

  await logFeedEvent({
    event_type: "specialist_spawned",
    source: "system",
    summary: `Specialist '${specialist.name}' spawned — ${input.mission}`,
    related_task_id: input.taskId,
  });

  return { data: specialist, error: null };
}

export async function completeSpecialist(
  id: string,
  outputSummary: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("specialists")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      output_summary: outputSummary,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await logFeedEvent({
    event_type: "specialist_completed",
    source: "system",
    summary: `Specialist completed — ${outputSummary.slice(0, 80)}`,
  });

  return { error: null };
}

export async function terminateSpecialist(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("specialists")
    .update({
      status: "terminated",
      ended_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await logFeedEvent({
    event_type: "specialist_terminated",
    source: "system",
    summary: "Specialist terminated",
  });

  return { error: null };
}

// ── Promotion Logic ──────────────────────────────────

const PROMOTION_THRESHOLD = 3; // spawn count before recommending permanent

export function getPromotionRecommendations(
  specialistTypes: SpecialistType[],
  agents: Agent[]
): Array<{
  type: SpecialistType;
  reason: string;
  evidence: { spawns: number; suggestedDept: string };
}> {
  const existingDomains = new Set(agents.map((a) => a.domain.toLowerCase()));

  return specialistTypes
    .filter((st) => st.spawn_count >= PROMOTION_THRESHOLD)
    .map((st) => ({
      type: st,
      reason: `${st.name} has been spawned ${st.spawn_count} times. This suggests recurring demand that could benefit from a permanent agent.`,
      evidence: {
        spawns: st.spawn_count,
        suggestedDept: st.category,
      },
    }));
}

// ── Department Performance ───────────────────────────

export function getDepartmentPerformance(
  tasks: TaskWithAgent[],
  agents: Agent[],
  departments: Department[]
): Array<{
  department: Department;
  assignedAgents: Agent[];
  totalTasks: number;
  completedTasks: number;
  blockedTasks: number;
  blockedRatio: number;
  agentUtilization: number;
}> {
  return departments.map((dept) => {
    const deptAgents = agents.filter((a) =>
      a.domain.toLowerCase().includes(dept.name.toLowerCase().split("-")[0])
    );
    const agentIds = new Set(deptAgents.map((a) => a.id));
    const deptTasks = tasks.filter((t) => t.assigned_agent_id && agentIds.has(t.assigned_agent_id));
    const completed = deptTasks.filter((t) => t.status === "done").length;
    const blocked = deptTasks.filter((t) => t.status === "blocked").length;

    return {
      department: dept,
      assignedAgents: deptAgents,
      totalTasks: deptTasks.length,
      completedTasks: completed,
      blockedTasks: blocked,
      blockedRatio: deptTasks.length > 0 ? Math.round((blocked / deptTasks.length) * 100) : 0,
      agentUtilization: deptAgents.length > 0 ? Math.min(100, Math.round((deptTasks.filter((t) => t.status !== "done").length / (deptAgents.length * 4)) * 100)) : 0,
    };
  });
}
