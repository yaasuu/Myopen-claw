import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const body = await request.json();

  // Create task
  if (body.action === "create_task") {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: body.title,
        description: body.description ?? "",
        status: body.status ?? "pending",
        priority: body.priority ?? "medium",
        assigned_agent_id: body.assigned_agent_id ?? null,
        owner: body.owner ?? "Yas",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Log feed event
    await supabase.from("feed_events").insert({
      event_type: "task_created",
      source: "Yas Claw",
      summary: `New task '${data.title}' created`,
      related_task_id: data.id,
      related_agent_id: data.assigned_agent_id,
    });

    return NextResponse.json({ data });
  }

  // Update task status
  if (body.action === "update_task_status") {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.task_id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const eventMap: Record<string, string> = {
      "in-progress": "task_updated",
      done: "task_completed",
      blocked: "blocker_detected",
      pending: "task_updated",
    };

    await supabase.from("feed_events").insert({
      event_type: eventMap[body.status] ?? "task_updated",
      source: "Yas Claw",
      summary: `Task '${data.title}' → ${body.status}`,
      related_task_id: data.id,
      related_agent_id: data.assigned_agent_id,
    });

    return NextResponse.json({ data });
  }

  // Log feed event
  if (body.action === "log_feed_event") {
    const { data, error } = await supabase
      .from("feed_events")
      .insert({
        event_type: body.event_type,
        source: body.source ?? "Yas Claw",
        summary: body.summary,
        related_task_id: body.related_task_id ?? null,
        related_agent_id: body.related_agent_id ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Get agents
  if (body.action === "get_agents") {
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, short_id, emoji, status, domain")
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Get tasks
  if (body.action === "get_tasks") {
    let query = supabase
      .from("tasks")
      .select("*, agents(name, emoji)")
      .order("created_at", { ascending: false })
      .limit(body.limit ?? 20);

    if (body.status) query = query.eq("status", body.status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
