import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent, type FeedEventType } from "@/lib/data/feed-events";
import type { Task, TaskWithAgent } from "@/types/dashboard";

const MOCK_AGENT_MAP: Record<string, { name: string; emoji: string }> = {
  "mock-1": { name: "Export-Growth Agent", emoji: "📦" },
  "mock-2": { name: "Ops-Improvement Agent", emoji: "⚙️" },
  "mock-3": { name: "Architecture-Systems Agent", emoji: "🏗️" },
};

const MOCK_TASKS: Task[] = [
  {
    id: "mock-1",
    title: "Review export documentation",
    description: "Review and update export docs for Q2 shipment",
    status: "in-progress",
    priority: "high",
    assigned_agent_id: "mock-1",
    project_id: null,
    blocker: null,
    owner: "Yas",
    is_archived: false,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60000).toISOString(),
  },
  {
    id: "mock-2",
    title: "Supplier readiness check",
    description: "Verify supplier can meet Q2 delivery timeline",
    status: "pending",
    priority: "medium",
    assigned_agent_id: "mock-1",
    project_id: null,
    blocker: null,
    owner: "Yas",
    is_archived: false,
    created_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 3600000).toISOString(),
  },
  {
    id: "mock-3",
    title: "Weekly workflow review",
    description: "Review operational workflows for bottlenecks",
    status: "done",
    priority: "medium",
    assigned_agent_id: "mock-2",
    project_id: null,
    blocker: null,
    owner: "Yas",
    is_archived: false,
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: "mock-4",
    title: "Buyer follow-up: Acme Corp",
    description: "Follow up on supplier quote for Acme Corp order",
    status: "blocked",
    priority: "high",
    assigned_agent_id: "mock-1",
    project_id: null,
    blocker: "Waiting on supplier quote — 3 days overdue",
    owner: "Yas",
    is_archived: false,
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
  },
  {
    id: "mock-5",
    title: "Data model review",
    description: "Review and finalize data model for Mission Control",
    status: "in-progress",
    priority: "medium",
    assigned_agent_id: "mock-3",
    project_id: null,
    blocker: null,
    owner: "Yas",
    is_archived: false,
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
];

function attachAgentNames(
  tasks: Task[],
  agentMap: Record<string, { name: string; emoji: string }>
): TaskWithAgent[] {
  return tasks.map((task) => {
    const agent = task.assigned_agent_id ? agentMap[task.assigned_agent_id] : null;
    return {
      ...task,
      assigned_agent_name: agent?.name ?? null,
      assigned_agent_emoji: agent?.emoji ?? null,
    };
  });
}

async function buildAgentMap(
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Record<string, { name: string; emoji: string }>> {
  const { data, error } = await supabase.from("agents").select("id, name, emoji");
  if (error || !data || data.length === 0) return {};
  const map: Record<string, { name: string; emoji: string }> = {};
  for (const agent of data) {
    map[agent.id] = { name: agent.name, emoji: agent.emoji };
  }
  return map;
}

export async function getTasks(options?: { includeArchived?: boolean }): Promise<{ data: TaskWithAgent[]; error: string | null }> {
  const supabase = getSupabase();

  if (!supabase) {
    return { data: attachAgentNames(MOCK_TASKS, MOCK_AGENT_MAP), error: null };
  }

  let query = supabase.from("tasks").select("*");
  if (!options?.includeArchived) {
    query = query.or("is_archived.is.null,is_archived.eq.false");
  }

  const [tasksResult, agentMap] = await Promise.all([
    query.order("created_at", { ascending: false }),
    buildAgentMap(supabase),
  ]);

  const { data, error } = tasksResult;
  if (error) return { data: [], error: error.message };

  return { data: attachAgentNames((data ?? []) as Task[], agentMap), error: null };
}

export async function getTasksByStatus(status: Task["status"]): Promise<{ data: TaskWithAgent[]; error: string | null }> {
  const result = await getTasks();
  return { data: result.data.filter((t) => t.status === status), error: result.error };
}

export async function getTasksByAgent(agentId: string): Promise<{ data: TaskWithAgent[]; error: string | null }> {
  const result = await getTasks();
  return { data: result.data.filter((t) => t.assigned_agent_id === agentId), error: result.error };
}

export async function getBlockedTasks(): Promise<{ data: TaskWithAgent[]; error: string | null }> {
  return getTasksByStatus("blocked");
}

export async function getTaskStats() {
  const { data: tasks } = await getTasks();
  return {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
}

export type CreateTaskInput = {
  title: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  assigned_agent_id?: string | null;
  blocker?: string | null;
  owner?: string;
};

export async function createTask(input: CreateTaskInput): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description ?? "",
      status: input.status ?? "pending",
      priority: input.priority ?? "medium",
      assigned_agent_id: input.assigned_agent_id ?? null,
      blocker: input.blocker ?? null,
      owner: input.owner ?? "Yas",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const task = data as Task;

  // Log feed event: task created
  await logFeedEvent({
    event_type: "task_created",
    source: "system",
    summary: `New task '${task.title}' created`,
    related_task_id: task.id,
    related_agent_id: task.assigned_agent_id,
  });

  // If created as blocked, also log blocker_detected
  if (task.status === "blocked") {
    await logFeedEvent({
      event_type: "blocker_detected",
      source: "system",
      summary: `Blocker detected on '${task.title}'${task.blocker ? ` — ${task.blocker}` : ""}`,
      related_task_id: task.id,
      related_agent_id: task.assigned_agent_id,
    });
  }

  return { data: task, error: null };
}

export async function updateTaskStatus(
  id: string,
  status: Task["status"]
): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const task = data as Task;

  // Fetch previous status to detect blocker_resolved
  const { data: prevData } = await supabase
    .from("tasks")
    .select("status")
    .eq("id", id)
    .neq("status", status)
    .limit(1);

  // We already updated, so prevData won't match. Use a different approach:
  // Log based on the new status, plus check if this was a blocked→other transition.
  // Since we don't have the old status after update, we log blocker_resolved
  // whenever a task moves TO any non-blocked status (the caller knows the intent).

  const eventMap: Record<string, FeedEventType> = {
    done: "task_completed",
    blocked: "blocker_detected",
    "in-progress": "task_updated",
    pending: "task_updated",
  };

  await logFeedEvent({
    event_type: eventMap[status] ?? "task_updated",
    source: "system",
    summary:
      status === "done"
        ? `Completed: ${task.title}`
        : status === "blocked"
          ? `Blocker detected on '${task.title}'${task.blocker ? ` — ${task.blocker}` : ""}`
          : `Task '${task.title}' updated to ${status}`,
    related_task_id: task.id,
    related_agent_id: task.assigned_agent_id,
  });

  return { data: task, error: null };
}

// Specialized unblock function that logs blocker_resolved
export async function unblockTask(
  id: string,
  newStatus: Task["status"] = "pending"
): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .update({ status: newStatus, blocker: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const task = data as Task;

  await logFeedEvent({
    event_type: "blocker_resolved",
    source: "system",
    summary: `Blocker resolved on '${task.title}'`,
    related_task_id: task.id,
    related_agent_id: task.assigned_agent_id,
  });

  return { data: task, error: null };
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "assigned_agent_id" | "blocker" | "owner">>
): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Task, error: null };
}

export async function updateTaskAssignment(
  taskId: string,
  agentId: string | null
): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .update({ assigned_agent_id: agentId, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const task = data as Task;

  // Build agent map for summary
  let agentName = "unassigned";
  if (agentId) {
    const agentMap = await buildAgentMap(supabase);
    agentName = agentMap[agentId]?.name ?? agentId;
  }

  await logFeedEvent({
    event_type: "agent_routed",
    source: "system",
    summary: `Task '${task.title}' assigned to ${agentName}`,
    related_task_id: task.id,
    related_agent_id: agentId,
  });

  return { data: task, error: null };
}

export async function archiveTask(id: string): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const task = data as Task;

  await logFeedEvent({
    event_type: "task_updated",
    source: "system",
    summary: `Task '${task.title}' archived`,
    related_task_id: task.id,
    related_agent_id: task.assigned_agent_id,
  });

  return { data: task, error: null };
}

export async function unarchiveTask(id: string): Promise<{ data: Task | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("tasks")
    .update({ is_archived: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const task = data as Task;

  await logFeedEvent({
    event_type: "task_updated",
    source: "system",
    summary: `Task '${task.title}' unarchived`,
    related_task_id: task.id,
    related_agent_id: task.assigned_agent_id,
  });

  return { data: task, error: null };
}
