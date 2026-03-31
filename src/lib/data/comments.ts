import { getSupabase } from "@/lib/supabase/client";
import type { TaskComment } from "@/types/dashboard";

const MOCK_COMMENTS: TaskComment[] = [
  {
    id: "mc-1",
    task_id: "mock-1",
    author: "Yas",
    author_role: "ceo",
    content: "This needs to be prioritized for this week.",
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "mc-2",
    task_id: "mock-1",
    author: "Export-Growth Agent",
    author_role: "agent",
    content: "I've identified the main blockers. Waiting on supplier confirmation.",
    created_at: new Date(Date.now() - 1 * 3600000).toISOString(),
  },
  {
    id: "mc-3",
    task_id: "mock-1",
    author: "Yas",
    author_role: "ceo",
    content: "Follow up again tomorrow morning. If no response, escalate.",
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
  },
];

export async function getTaskComments(taskId: string): Promise<{ data: TaskComment[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: MOCK_COMMENTS.filter((c) => c.task_id === taskId), error: null };
  }

  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TaskComment[], error: null };
}

export async function addTaskComment(
  taskId: string,
  content: string,
  author: string = "Yas",
  authorRole: "ceo" | "agent" | "system" = "ceo"
): Promise<{ data: TaskComment | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("task_comments")
    .insert({
      task_id: taskId,
      author,
      author_role: authorRole,
      content,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as TaskComment, error: null };
}
