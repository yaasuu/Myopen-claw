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
