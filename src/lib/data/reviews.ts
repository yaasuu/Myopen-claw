import { getSupabase } from "@/lib/supabase/client";
import { updateTaskStatus } from "@/lib/data/tasks";
import { logFeedEvent } from "@/lib/data/feed-events";
import type { TaskReview, ReviewOutcome } from "@/types/dashboard";

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
  reviewedBy: string = "Yas"
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
  const statusMap: Record<ReviewOutcome, string> = {
    approved: "done",
    rejected: "in-progress",
    returned_for_rework: "in-progress",
  };

  await updateTaskStatus(taskId, statusMap[outcome] as any);

  // Log feed event
  const eventMap: Record<ReviewOutcome, string> = {
    approved: "Task approved and marked done",
    rejected: "Task rejected — needs rework",
    returned_for_rework: "Task returned for rework",
  };

  await logFeedEvent({
    event_type: outcome === "approved" ? "task_completed" : "task_updated",
    source: reviewedBy,
    summary: `${eventMap[outcome]}: ${notes || "No notes"}`,
    related_task_id: taskId,
  });

  return { data: review, error: null };
}
