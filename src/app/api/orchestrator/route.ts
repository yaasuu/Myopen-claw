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

    // Create notification for task creation
    await supabase.from("notifications").insert({
      type: "task_created",
      severity: data.priority === "high" ? "warning" : "info",
      title: `New Task: ${data.title}`,
      message: `Task created and ${data.assigned_agent_id ? "assigned" : "unassigned"} — ${data.priority} priority`,
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

    // Create notification for status changes
    const notifSeverity = body.status === "blocked" ? "critical" : body.status === "done" ? "info" : "info";
    await supabase.from("notifications").insert({
      type: body.status === "blocked" ? "blocker_detected" : body.status === "done" ? "task_completed" : "task_reassigned",
      severity: notifSeverity,
      title: `Task ${body.status}: ${data.title}`,
      message: `Status changed to ${body.status}${body.status === "blocked" && data.blocker ? ` — ${data.blocker}` : ""}`,
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

  // Create notification
  if (body.action === "create_notification") {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        type: body.type ?? "system_alert",
        title: body.title ?? "Notification",
        message: body.message ?? "",
        severity: body.severity ?? "info",
        related_task_id: body.related_task_id ?? null,
        related_agent_id: body.related_agent_id ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Get notifications
  if (body.action === "get_notifications") {
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(body.limit ?? 20);

    if (body.unreadOnly) query = query.eq("is_read", false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Get system status
  if (body.action === "get_system_status") {
    const { data, error } = await supabase
      .from("system_status")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Create comment
  if (body.action === "create_comment") {
    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: body.task_id,
        author: body.author ?? "Yas",
        author_role: body.author_role ?? "ceo",
        content: body.content,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Log feed event
    await supabase.from("feed_events").insert({
      event_type: "task_updated",
      source: body.author ?? "Yas",
      summary: `Comment added to task: ${body.content?.slice(0, 80)}`,
      related_task_id: body.task_id,
    });

    return NextResponse.json({ data });
  }

  // Get comments for a task
  if (body.action === "get_comments") {
    const { data, error } = await supabase
      .from("task_comments")
      .select("*")
      .eq("task_id", body.task_id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  // Log feed event directly
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

  // Generate daily summary
  if (body.action === "generate_summary") {
    const targetDate = body.date ?? new Date().toISOString().split("T")[0];
    const startOfDay = `${targetDate}T00:00:00Z`;
    const endOfDay = `${targetDate}T23:59:59Z`;

    // Fetch today's feed events
    const { data: events } = await supabase
      .from("feed_events")
      .select("*")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .order("created_at", { ascending: true });

    const feedEvents = events ?? [];

    // Categorize events
    const decisions: string[] = [];
    const blockers: string[] = [];
    const priorities: string[] = [];

    for (const event of feedEvents) {
      if (event.event_type === "task_completed") decisions.push(`Completed: ${event.summary}`);
      if (event.event_type === "blocker_detected") blockers.push(event.summary);
      if (event.event_type === "agent_hired" || event.event_type === "skill_approved") decisions.push(event.summary);
      if (event.event_type === "blocker_resolved") decisions.push(`Resolved: ${event.summary}`);
    }

    if (blockers.length > 0) priorities.push(`Resolve ${blockers.length} blocker(s)`);

    const summary = feedEvents.length > 0
      ? `${feedEvents.length} events today.`
      : "No activity recorded today.";

    // Upsert daily note
    const { data: note, error } = await supabase
      .from("daily_notes")
      .upsert({
        date: targetDate,
        summary,
        events_reviewed: feedEvents.length,
        decisions,
        blockers,
        priorities_tomorrow: priorities,
        updated_at: new Date().toISOString(),
      }, { onConflict: "date" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: note });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
