import { getSupabase } from "@/lib/supabase/client";
import type { Project, ProjectWithStats, TaskWithAgent, FeedEvent } from "@/types/dashboard";

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

function isProjectStatus(value: unknown): value is Project["status"] {
  return value === "planning" || value === "active" || value === "on-hold" || value === "completed" || value === "cancelled";
}

function isProjectPriority(value: unknown): value is Project["priority"] {
  return value === "high" || value === "medium" || value === "low";
}

function normalizeProject(project: Record<string, unknown>): Project {
  return {
    id: String(project.id ?? ""),
    project_code: String(project.project_code ?? ""),
    title: String(project.title ?? ""),
    objective: String(project.objective ?? ""),
    scope: String(project.scope ?? ""),
    deliverables: normalizeStringArray(project.deliverables),
    deliverables_done: normalizeStringArray(project.deliverables_done),
    success_criteria: normalizeStringArray(project.success_criteria),
    criteria_done: normalizeStringArray(project.criteria_done),
    owner_department: String(project.owner_department ?? ""),
    status: isProjectStatus(project.status) ? project.status : "planning",
    priority: isProjectPriority(project.priority) ? project.priority : "medium",
    progress: typeof project.progress === "number" ? project.progress : Number(project.progress ?? 0) || 0,
    due_date: project.due_date == null ? null : String(project.due_date),
    status_narrative:    typeof project.status_narrative === "string"    ? project.status_narrative    : null,
    status_narrative_at: typeof project.status_narrative_at === "string" ? project.status_narrative_at : null,
    status_narrative_by: typeof project.status_narrative_by === "string" ? project.status_narrative_by : null,
    created_at: String(project.created_at ?? new Date().toISOString()),
    updated_at: String(project.updated_at ?? new Date().toISOString()),
  };
}

// ── Mock Data ────────────────────────────────────────

const MOCK_PROJECTS: Project[] = [
  {
    id: "proj-1",
    project_code: "YAS-001",
    title: "Mission Control Dashboard",
    objective: "Build the CEO-facing mission control dashboard for Yas Claw",
    scope: "Full-stack Next.js + Supabase dashboard with auth, tasks, agents, departments, skills",
    deliverables: ["Working dashboard", "Auth system", "Task board", "Agent management"],
    deliverables_done: ["Working dashboard", "Auth system"],
    success_criteria: ["All routes compile", "Auth working", "Realtime updates active"],
    criteria_done: ["All routes compile", "Auth working"],
    owner_department: "Architecture-Systems",
    status: "active",
    priority: "high",
    progress: 75,
    due_date: "2026-04-15",
    created_at: "2026-03-28T00:00:00Z",
    updated_at: new Date().toISOString(),
  },
  {
    id: "proj-2",
    project_code: "YAS-002",
    title: "Export Pipeline Automation",
    objective: "Automate export documentation and buyer follow-up workflows",
    scope: "Export documentation generation, buyer communication templates, shipment tracking",
    deliverables: ["Document templates", "Follow-up automation", "Tracking integration"],
    deliverables_done: [],
    success_criteria: ["50% reduction in manual export tasks", "Buyer response time < 24h"],
    criteria_done: [],
    owner_department: "Export-Growth",
    status: "active",
    priority: "high",
    progress: 30,
    due_date: "2026-05-01",
    created_at: "2026-03-28T00:00:00Z",
    updated_at: new Date().toISOString(),
  },
  {
    id: "proj-3",
    project_code: "YAS-003",
    title: "Ops Workflow Redesign",
    objective: "Review and optimize all internal operational workflows",
    scope: "Map current workflows, identify bottlenecks, propose improvements, implement changes",
    deliverables: ["Workflow map", "Bottleneck report", "Improved SOPs"],
    deliverables_done: [],
    success_criteria: ["All workflows documented", "3+ bottlenecks resolved"],
    criteria_done: [],
    owner_department: "Ops-Improvement",
    status: "planning",
    priority: "medium",
    progress: 10,
    due_date: "2026-06-01",
    created_at: "2026-03-30T00:00:00Z",
    updated_at: new Date().toISOString(),
  },
];

function isProjectCompletedTask(status: string): boolean {
  return status === "done" || status === "approved";
}

// ── CRUD ─────────────────────────────────────────────

export async function getProjects(): Promise<{ data: ProjectWithStats[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      data: MOCK_PROJECTS.map((p) => ({
        ...p,
        open_tasks: Math.floor(Math.random() * 5) + 1,
        blocked_tasks: Math.floor(Math.random() * 2),
        completed_tasks: Math.floor(Math.random() * 3),
        submitted_tasks: 0,
        approved_tasks: 0,
        review_count: 0,
        last_review_at: null,
      })),
      error: null,
    };
  }

  const [projectsResult, tasksResult, reviewsResult] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, status, project_id").not("project_id", "is", null),
    supabase.from("project_reviews").select("project_id, created_at").order("created_at", { ascending: false }),
  ]);

  if (projectsResult.error) return { data: [], error: projectsResult.error.message };

  const tasks = tasksResult.data ?? [];
  const reviews = reviewsResult.data ?? [];
  const projects = (projectsResult.data ?? []).map((project) => normalizeProject(project as Record<string, unknown>));

  const data: ProjectWithStats[] = projects.map((p) => {
    const projTasks = tasks.filter((t) => t.project_id === p.id);
    const projReviews = reviews.filter((r) => r.project_id === p.id);
    return {
      ...p,
      open_tasks: projTasks.filter((t) => t.status !== "done").length,
      blocked_tasks: projTasks.filter((t) => t.status === "blocked").length,
      completed_tasks: projTasks.filter((t) => isProjectCompletedTask(t.status)).length,
      submitted_tasks: projTasks.filter((t) => t.status === "submitted" || t.status === "in-review").length,
      approved_tasks: projTasks.filter((t) => t.status === "approved").length,
      review_count: projReviews.length,
      last_review_at: projReviews[0]?.created_at ?? null,
    };
  });

  return { data, error: null };
}

export async function getProjectById(id: string): Promise<{
  data: Project | null;
  tasks: TaskWithAgent[];
  events: FeedEvent[];
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    const proj = MOCK_PROJECTS.find((p) => p.id === id);
    return { data: proj ?? null, tasks: [], events: [], error: proj ? null : "Project not found" };
  }

  const [projResult, tasksResult, eventsResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("tasks").select("*, agents(name, emoji)").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("feed_events").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  if (projResult.error) return { data: null, tasks: [], events: [], error: projResult.error.message };
  if (!projResult.data) return { data: null, tasks: [], events: [], error: "Project not found" };

  const tasks = (tasksResult.data ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    assigned_agent_name: (t.agents as Record<string, unknown>)?.name ?? null,
    assigned_agent_emoji: (t.agents as Record<string, unknown>)?.emoji ?? null,
  })) as TaskWithAgent[];

  const taskIds = new Set(tasks.map((t) => t.id));
  const events = ((eventsResult.data ?? []) as FeedEvent[])
    .filter((event) => event.related_task_id && taskIds.has(event.related_task_id))
    .slice(0, 10);

  return {
    data: normalizeProject(projResult.data as Record<string, unknown>),
    tasks,
    events,
    error: null,
  };
}

export async function createProject(input: {
  title: string;
  objective: string;
  scope: string;
  department: string;
  priority: "high" | "medium" | "low";
  dueDate?: string;
  deliverables?: string[];
  successCriteria?: string[];
}): Promise<{ data: Project | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  // Generate project code
  const { count } = await supabase.from("projects").select("*", { count: "exact", head: true });
  const code = `YAS-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      project_code: code,
      title: input.title,
      objective: input.objective,
      scope: input.scope,
      owner_department: input.department,
      priority: input.priority,
      due_date: input.dueDate ?? null,
      deliverables: input.deliverables ?? [],
      success_criteria: input.successCriteria ?? [],
      status: "planning",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Project, error: null };
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<Project, "title" | "objective" | "scope" | "status" | "priority" | "progress" | "due_date" | "deliverables" | "deliverables_done" | "success_criteria" | "criteria_done" | "owner_department">>
): Promise<{ data: Project | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Project, error: null };
}

export async function toggleProjectDeliverable(
  projectId: string,
  deliverableText: string,
  done: boolean
): Promise<{ data: Project | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data: current, error: getErr } = await supabase
    .from("projects")
    .select("deliverables_done")
    .eq("id", projectId)
    .single();
  if (getErr) return { data: null, error: getErr.message };

  const prev = ((current?.deliverables_done as string[]) ?? []).filter((t) => t !== deliverableText);
  const next = done ? [...prev, deliverableText] : prev;

  const { data, error } = await supabase
    .from("projects")
    .update({ deliverables_done: next, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Project, error: null };
}

export async function toggleProjectCriterion(
  projectId: string,
  criterionText: string,
  done: boolean
): Promise<{ data: Project | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data: current, error: getErr } = await supabase
    .from("projects")
    .select("criteria_done")
    .eq("id", projectId)
    .single();
  if (getErr) return { data: null, error: getErr.message };

  const prev = ((current?.criteria_done as string[]) ?? []).filter((t) => t !== criterionText);
  const next = done ? [...prev, criterionText] : prev;

  const { data, error } = await supabase
    .from("projects")
    .update({ criteria_done: next, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Project, error: null };
}

export async function setProjectStatusNarrative(
  projectId: string,
  narrative: string,
  by: string
): Promise<{ data: Project | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("projects")
    .update({
      status_narrative: narrative.trim() || null,
      status_narrative_at: narrative.trim() ? now : null,
      status_narrative_by: narrative.trim() ? by : null,
      updated_at: now,
    })
    .eq("id", projectId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Project, error: null };
}

export async function assignTaskToProject(taskId: string, projectId: string | null): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("tasks")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  return { error: error?.message ?? null };
}

export async function applyProjectPlan(
  projectId: string,
  plan: {
    department: string;
    taskTitles: Array<{ title: string; priority: string; agentId: string | null }>;
  }
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  // Update project department
  await supabase
    .from("projects")
    .update({ owner_department: plan.department, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  // Create tasks
  for (const task of plan.taskTitles) {
    await supabase.from("tasks").insert({
      title: task.title,
      status: "pending",
      priority: task.priority,
      assigned_agent_id: task.agentId,
      project_id: projectId,
      owner: "Yas",
    });
  }

  return { error: null };
}
