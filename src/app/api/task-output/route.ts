import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/task-output?task_id=<uuid>
 * Returns the full output_data for a task, plus task metadata.
 *
 * GET /api/task-output?project_id=<uuid>&limit=50
 * Returns all tasks with output_data for a project (for the Outputs tab).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId    = searchParams.get("task_id");
  const projectId = searchParams.get("project_id");
  const limit     = parseInt(searchParams.get("limit") ?? "50");

  const supabase = getSupabaseAdmin();

  // ── Single task output ─────────────────────────────────────────────────────
  if (taskId) {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        id, title, description, status, priority, assigned_agent_id,
        output_data, submitted_at, updated_at,
        agents!assigned_agent_id (name, emoji, domain)
      `)
      .eq("id", taskId)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json({ error: "Task not found" }, { status: 404 });

    return NextResponse.json(data);
  }

  // ── All outputs for a project ──────────────────────────────────────────────
  if (projectId) {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        id, title, status, priority, assigned_agent_id, submitted_at, updated_at,
        output_data,
        agents!assigned_agent_id (name, emoji, domain)
      `)
      .eq("project_id", projectId)
      .not("output_data", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: "task_id or project_id required" }, { status: 400 });
}
