import { getSupabase } from "@/lib/supabase/client";
import { updateTaskStatus } from "@/lib/data/tasks";
import { logFeedEvent } from "@/lib/data/feed-events";
import type { TaskReview, ReviewOutcome } from "@/types/dashboard";

export async function getAllTaskReviews(limit = 50): Promise<{ data: TaskReview[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("task_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TaskReview[], error: null };
}

export async function getTaskReviews(taskId: string): Promise<{ data: TaskReview[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("task_reviews")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TaskReview[], error: null };
}

// Deliverable = a task_review with non-empty evidence, typically at review_stage="worker_submission"
export interface Deliverable extends TaskReview {
  task_title?: string;
  task_status?: string;
  project_id?: string | null;
  project_name?: string | null;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  assigned_agent_emoji?: string | null;
}

export async function getAllDeliverables(limit = 200): Promise<{ data: Deliverable[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data: reviews, error } = await supabase
    .from("task_reviews")
    .select("*")
    .not("evidence", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };

  const reviewRows = (reviews ?? []) as TaskReview[];
  // Filter out empty evidence strings
  const withEvidence = reviewRows.filter((r) => r.evidence && r.evidence.trim() !== "");
  if (withEvidence.length === 0) return { data: [], error: null };

  // Fetch related tasks
  const taskIds = Array.from(new Set(withEvidence.map((r) => r.task_id)));
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, project_id, assigned_agent_id")
    .in("id", taskIds);

  const taskMap = new Map((tasks ?? []).map((t) => [t.id, t]));

  // Fetch related agents
  const agentIds = Array.from(new Set((tasks ?? []).map((t) => t.assigned_agent_id).filter(Boolean) as string[]));
  let agentMap = new Map<string, { name: string; emoji: string }>();
  if (agentIds.length > 0) {
    const { data: agents } = await supabase.from("agents").select("id, name, emoji").in("id", agentIds);
    agentMap = new Map((agents ?? []).map((a) => [a.id, { name: a.name, emoji: a.emoji }]));
  }

  // Fetch related projects
  const projectIds = Array.from(new Set((tasks ?? []).map((t) => t.project_id).filter(Boolean) as string[]));
  let projectMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, title").in("id", projectIds);
    projectMap = new Map((projects ?? []).map((p) => [p.id, p.title]));
  }

  const enriched: Deliverable[] = withEvidence.map((r) => {
    const task = taskMap.get(r.task_id);
    const agent = task?.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : null;
    return {
      ...r,
      task_title: task?.title,
      task_status: task?.status,
      project_id: task?.project_id ?? null,
      project_name: task?.project_id ? projectMap.get(task.project_id) ?? null : null,
      assigned_agent_id: task?.assigned_agent_id ?? null,
      assigned_agent_name: agent?.name ?? null,
      assigned_agent_emoji: agent?.emoji ?? null,
    };
  });

  return { data: enriched, error: null };
}

// Create a worker submission review (deliverable) — used by the evidence gate
// and called by Hermes when finalizing a task
export async function submitDeliverable(
  taskId: string,
  evidence: string,
  submittedBy: string = "Hermes Agent",
  notes: string = ""
): Promise<{ data: TaskReview | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("task_reviews")
    .insert({
      task_id: taskId,
      outcome: "approved", // worker submission is "pre-approved" pending orchestrator review
      notes,
      reviewed_by: submittedBy,
      review_stage: "worker_submission",
      evidence,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Advance task status to submitted
  await updateTaskStatus(taskId, "submitted");

  // Log feed event
  await logFeedEvent({
    event_type: "task_updated",
    source: submittedBy,
    summary: `Deliverable submitted: ${evidence.slice(0, 80)}${evidence.length > 80 ? "…" : ""}`,
    related_task_id: taskId,
  });

  return { data: data as TaskReview, error: null };
}

export async function submitReview(
  taskId: string,
  outcome: ReviewOutcome,
  notes: string = "",
  reviewedBy: string = "Hermes Orchestrator"
): Promise<{ data: TaskReview | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  // Create review record
  const { data, error } = await supabase
    .from("task_reviews")
    .insert({
      task_id: taskId,
      outcome,
      notes,
      reviewed_by: reviewedBy,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const review = data as TaskReview;

  // Update task status based on outcome
  const statusMap: Record<ReviewOutcome, "approved" | "blocked" | "rework"> = {
    approved: "approved",
    rejected: "blocked",
    returned_for_rework: "rework",
  };

  const taskUpdate = await updateTaskStatus(taskId, statusMap[outcome]);
  if (taskUpdate.error) return { data: null, error: taskUpdate.error };

  await supabase
    .from("tasks")
    .update({
      reviewed_by: reviewedBy,
      review_notes: notes,
      review_status:
        outcome === "approved"
          ? "approved"
          : outcome === "rejected"
            ? "rejected"
            : "returned_for_rework",
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  // Log feed event
  const eventMap: Record<ReviewOutcome, { event_type: "task_updated" | "task_returned_for_rework"; summary: string }> = {
    approved: { event_type: "task_updated", summary: "Task approved by orchestrator" },
    rejected: { event_type: "task_updated", summary: "Task rejected by orchestrator" },
    returned_for_rework: { event_type: "task_returned_for_rework", summary: "Task returned for rework by orchestrator" },
  };

  await logFeedEvent({
    event_type: eventMap[outcome].event_type,
    source: reviewedBy,
    summary: `${eventMap[outcome].summary}: ${notes || "No notes"}`,
    related_task_id: taskId,
  });

  return { data: review, error: null };
}
