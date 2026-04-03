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

  // Generate daily summary (legacy — kept for backwards compatibility)
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

  // ─── Generate Daily Team Sync (full A–G report) ──────────────
  if (body.action === "generate_daily_sync") {
    // Calculate Addis Ababa time window (UTC+3)
    // 00:00 Addis = 21:00 UTC the previous day
    const addisOffset = 3; // UTC+3
    const now = new Date();
    const addisNow = new Date(now.getTime() + addisOffset * 3600000);
    const addisDateStr = addisNow.toISOString().split("T")[0];

    // Window: previous Addis day (00:00–23:59 Addis)
    const prevAddis = new Date(addisNow);
    prevAddis.setDate(prevAddis.getDate() - 1);
    const prevAddisDateStr = prevAddis.toISOString().split("T")[0];

    // Convert to UTC for Supabase
    const dayStart = new Date(prevAddisDateStr);
    dayStart.setHours(0, 0, 0, 0);
    const startUTC = new Date(dayStart.getTime() - addisOffset * 3600000).toISOString();

    const dayEnd = new Date(prevAddisDateStr);
    dayEnd.setHours(23, 59, 59, 999);
    const endUTC = new Date(dayEnd.getTime() - addisOffset * 3600000).toISOString();

    // Fetch all agents
    const { data: allAgents } = await supabase
      .from("agents")
      .select("id, name, short_id, emoji, status, domain, role_title, specialist_domain");

    // Fetch all task activity in window
    const { data: allTasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, assigned_agent_id, blocker, owner, updated_at, created_at")
      .or(`updated_at.gte.${startUTC},created_at.gte.${startUTC}`)
      .order("updated_at", { ascending: false });

    // Fetch feed events in window
    const { data: feedEvents } = await supabase
      .from("feed_events")
      .select("*")
      .gte("created_at", startUTC)
      .lte("created_at", endUTC)
      .order("created_at", { ascending: true });

    // Fetch reviews in window
    const { data: reviews } = await supabase
      .from("task_reviews")
      .select("*, tasks(title, assigned_agent_id)")
      .gte("created_at", startUTC)
      .lte("created_at", endUTC)
      .order("created_at", { ascending: false });

    // ── Build per-agent updates ────────────────────────────
    const agentUpdates: any[] = [];
    const agents = allAgents ?? [];
    const tasks = allTasks ?? [];
    const events = feedEvents ?? [];
    const reviewList = reviews ?? [];

    // Group tasks by agent
    const agentTaskMap = new Map<string, any[]>();
    for (const t of tasks) {
      const agentId = t.assigned_agent_id ?? "unassigned";
      if (!agentTaskMap.has(agentId)) agentTaskMap.set(agentId, []);
      agentTaskMap.get(agentId)!.push(t);
    }

    // Group events by agent
    const agentEventMap = new Map<string, any[]>();
    for (const e of events) {
      const agentId = e.related_agent_id ?? "system";
      if (!agentEventMap.has(agentId)) agentEventMap.set(agentId, []);
      agentEventMap.get(agentId)!.push(e);
    }

    for (const agent of agents) {
      const agentTasks = agentTaskMap.get(agent.id) ?? [];
      const agentEvents = agentEventMap.get(agent.id) ?? [];
      const agentReviews = reviewList.filter(r => r.tasks?.assigned_agent_id === agent.id);

      const completed = agentTasks.filter((t: any) => t.status === "done");
      const inProgress = agentTasks.filter((t: any) => t.status === "in-progress");
      const blocked = agentTasks.filter((t: any) => t.status === "blocked");
      const pending = agentTasks.filter((t: any) => t.status === "pending");
      const inReview = agentTasks.filter((t: any) => t.status === "in-review");

      const agentUpdate = {
        agent_id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        domain: agent.specialist_domain ?? agent.domain,
        status: agent.status,
        workload: {
          completed: completed.length,
          in_progress: inProgress.length,
          blocked: blocked.length,
          pending: pending.length,
          in_review: inReview.length,
          total_today: agentTasks.length,
        },
        completed_tasks: completed.map((t: any) => t.title),
        current_tasks: [...inProgress, ...inReview].map((t: any) => t.title),
        blockers: blocked.map((t: any) => t.blocker ?? "Unknown blocker"),
        events: agentEvents.map((e: any) => e.summary).slice(0, 5),
        reviews_received: agentReviews.length,
        utilization: agentTasks.length === 0 ? (agent.status === "active" ? "idle" : "inactive") : agentTasks.length > 8 ? "overloaded" : "normal",
      };

      agentUpdates.push(agentUpdate);
    }

    // ── Cross-team coordination ───────────────────────────
    const blockedTasks = tasks.filter((t: any) => t.status === "blocked");
    const inReviewTasks = tasks.filter((t: any) => t.status === "in-review");
    const unassignedOpen = tasks.filter((t: any) => !t.assigned_agent_id && t.status !== "done");

    const crossTeamSummary = {
      total_blockers: blockedTasks.length,
      total_in_review: inReviewTasks.length,
      unassigned_open: unassignedOpen.length,
      handoffs_today: events.filter((e: any) => e.event_type === "task_reassigned").length,
      coordination_notes: [
        blockedTasks.length > 0 ? `${blockedTasks.length} task(s) blocked — review needed` : null,
        inReviewTasks.length > 0 ? `${inReviewTasks.length} task(s) awaiting review` : null,
        unassignedOpen.length > 0 ? `${unassignedOpen.length} open task(s) unassigned` : null,
      ].filter(Boolean),
    };

    // ── Skill gaps / capability review ────────────────────
    const skillGaps = agentUpdates
      .filter((a: any) => a.utilization === "idle" || a.utilization === "overloaded")
      .map((a: any) => ({
        agent: a.name,
        issue: a.utilization === "idle" ? "Underused — no tasks assigned" : `Overloaded — ${a.workload.total_today} tasks`,
        recommendation: a.utilization === "idle" ? "Consider reassigning or spawning tasks" : "Review task distribution and consider delegation",
      }));

    // ── Issues faced today ────────────────────────────────
    const issuesList: string[] = [];
    if (blockedTasks.length > 0) issuesList.push(`${blockedTasks.length} blocked task(s)`);
    if (unassignedOpen.length > 0) issuesList.push(`${unassignedOpen.length} unassigned open task(s)`);
    if (inReviewTasks.length > 5) issuesList.push(`High review backlog (${inReviewTasks.length} tasks)`);

    const blockerEvents = events.filter((e: any) => e.event_type === "blocker_detected");
    if (blockerEvents.length > 0) {
      issuesList.push(`${blockerEvents.length} new blocker(s) detected`);
    }

    // ── Next-day priorities ──────────────────────────────
    const prioritiesTomorrow = [
      blockedTasks.length > 0 ? `Resolve ${blockedTasks.length} blocker(s)` : null,
      inReviewTasks.length > 0 ? `Review ${inReviewTasks.length} pending item(s)` : null,
      unassignedOpen.length > 0 ? `Assign ${unassignedOpen.length} unassigned task(s)` : null,
    ].filter(Boolean);

    // ── Yas Claw decisions ───────────────────────────────
    const yasDecisions: string[] = [];
    if (blockedTasks.length > 0) yasDecisions.push("Intervene on blocked tasks — reassign or remove blockers");
    if (inReviewTasks.length > 3) yasDecisions.push("Clear review backlog — priority action");
    if (skillGaps.length > 0) yasDecisions.push("Rebalance workload — some agents idle or overloaded");

    // ── Overall assessment ───────────────────────────────
    const totalActivity = tasks.length;
    const totalCompleted = tasks.filter((t: any) => t.status === "done").length;
    const overallHealth = blockedTasks.length === 0 && inReviewTasks.length < 5 ? "healthy" : "needs_attention";

    const executiveSummary = {
      total_activity: totalActivity,
      completed: totalCompleted,
      blocked: blockedTasks.length,
      health: overallHealth,
      summary: `Day summary: ${totalActivity} task events, ${totalCompleted} completed, ${blockedTasks.length} blocked. System ${overallHealth === "healthy" ? "operating normally" : "requires attention"}.`,
    };

    // ── Upsert daily note ─────────────────────────────────
    const { data: note, error } = await supabase
      .from("daily_notes")
      .upsert({
        date: prevAddisDateStr,
        summary: executiveSummary.summary,
        events_reviewed: events.length,
        decisions: yasDecisions.length > 0 ? yasDecisions : ["No critical decisions needed"],
        blockers: blockedTasks.map((t: any) => t.blocker ?? t.title),
        priorities_tomorrow: prioritiesTomorrow.length > 0 ? prioritiesTomorrow : ["Maintain current pace"],
        agent_updates: agentUpdates,
        cross_team_summary: crossTeamSummary,
        skill_gaps: skillGaps,
        issues_list: issuesList.length > 0 ? issuesList : ["No major issues"],
        yas_decisions: yasDecisions.length > 0 ? yasDecisions : ["No intervention needed"],
        sync_type: "full_sync",
        updated_at: now.toISOString(),
      }, { onConflict: "date" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Create feed event for sync generation
    await supabase.from("feed_events").insert({
      event_type: "daily_sync_generated",
      source: "Yas Claw Orchestrator",
      summary: `Daily sync generated for ${prevAddisDateStr}: ${totalActivity} events, ${totalCompleted} completed`,
    });

    return NextResponse.json({ data: note, date: prevAddisDateStr });
  }

  // ─── Generate Nightly Summary (23:00 Addis) ──────────────────────
  if (body.action === "generate_nightly_summary") {
    // Addis Ababa is UTC+3. 23:00 Addis = 20:00 UTC.
    const now = new Date();
    const addisOffset = 3;
    const addisNow = new Date(now.getTime() + addisOffset * 3600000);
    const addisDateStr = addisNow.toISOString().split("T")[0];

    // Window: Previous Addis Day (00:00 to 23:59 Addis)
    const prevAddis = new Date(addisNow);
    prevAddis.setDate(prevAddis.getDate() - 1);
    const prevDateStr = prevAddis.toISOString().split("T")[0];
    
    const dayStart = new Date(prevDateStr);
    dayStart.setUTCHours(21, 0, 0, 0); // 00:00 Addis
    const dayEnd = new Date(prevDateStr);
    dayEnd.setUTCHours(21 + 24, 0, 0, 0); // 24:00 Addis

    // 1. Gather Data
    const [agentsRes, tasksRes, commentsRes, reviewsRes] = await Promise.all([
      supabase.from("agents").select("id, name, emoji, specialist_domain, status"),
      supabase.from("tasks").select("id, title, status, priority, assigned_agent_id, blocker, owner, created_at, updated_at")
        .or(`updated_at.gte.${dayStart.toISOString()},created_at.gte.${dayStart.toISOString()}`)
        .lte(`updated_at`, dayEnd.toISOString()),
      supabase.from("task_comments").select("content, author, created_at, task_id")
        .gte("created_at", dayStart.toISOString()).lte("created_at", dayEnd.toISOString()),
      supabase.from("task_reviews").select("outcome, notes, created_at, tasks(title)")
        .gte("created_at", dayStart.toISOString()).lte("created_at", dayEnd.toISOString()),
    ]);

    const agents = agentsRes.data || [];
    const tasks = tasksRes.data || [];
    const comments = commentsRes.data || [];
    const reviews = reviewsRes.data || [];

    // 2. Execution Analysis
    const completed = tasks.filter((t: any) => t.status === "done").length;
    const blocked = tasks.filter((t: any) => t.status === "blocked");
    const inReview = tasks.filter((t: any) => t.status === "in-review");
    const active = tasks.filter((t: any) => t.status === "in-progress").length;

    // 3. Agent Performance & Gaps
    const agentUpdates = agents.map((agent: any) => {
      const agentTasks = tasks.filter((t: any) => t.assigned_agent_id === agent.id);
      const agentComments = comments.filter((c: any) => c.author === agent.name);
      const completedTasks = agentTasks.filter((t: any) => t.status === "done");
      
      return {
        name: agent.name,
        emoji: agent.emoji,
        workload: agentTasks.length,
        completed: completedTasks.length,
        outputs: agentComments.length,
        status: agent.status,
        weak_output: completedTasks.length === 0 && agentTasks.length > 2, // Heuristic for weak output
      };
    });

    // 4. Skill/Capability Gaps
    const skillGaps = agentUpdates.filter((a: any) => a.weak_output).map((a: any) => 
      `${a.name} shows repeated low output or delays despite ${a.workload} tasks.`
    );

    // 5. Coordination Gaps
    const handoffIssues = comments.filter((c: any) => c.content.toLowerCase().includes("waiting on") || c.content.toLowerCase().includes("blocker")).length;
    
    // 6. Yas Decisions
    const yasDecisions = [];
    if (blocked.length > 0) yasDecisions.push(`Intervene on ${blocked.length} blocked tasks immediately.`);
    if (inReview.length > 3) yasDecisions.push(`Clear review backlog of ${inReview.length} items.`);
    if (skillGaps.length > 0) yasDecisions.push(`Review prompt/templates for underperforming agents.`);

    // 7. Construct A-G Report
    const report = {
      summary: `Nightly Summary for ${prevDateStr}: ${completed} completed, ${blocked.length} blocked, ${inReview.length} in review.`,
      agent_updates: agentUpdates,
      cross_team_summary: {
        handoff_issues: handoffIssues,
        duplicated_effort: 0, // Placeholder for deeper analysis
      },
      skill_gaps: skillGaps,
      issues_list: blocked.map((t: any) => t.blocker || t.title),
      yas_decisions: yasDecisions,
      sync_type: "full_sync",
      date: prevDateStr,
      updated_at: now.toISOString()
    };

    const { data, error } = await supabase
      .from("daily_notes")
      .upsert(report, { onConflict: "date" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
