import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const now = new Date();
  const addisOffset = 3;
  const addisNow = new Date(now.getTime() + addisOffset * 3600000);
  const addisDateStr = addisNow.toISOString().split("T")[0];

  // Window: Previous Addis Day (00:00 to 23:59 Addis)
  const prevAddis = new Date(addisNow);
  prevAddis.setDate(prevAddis.getDate() - 1);
  const prevDateStr = prevAddis.toISOString().split("T")[0];
  const dayStart = new Date(prevDateStr);
  dayStart.setUTCHours(21, 0, 0, 0);
  const dayEnd = new Date(prevDateStr);
  dayEnd.setUTCHours(45, 0, 0, 0);

  // Gather all data
  const [agentsRes, tasksRes, commentsRes, reviewsRes, feedRes] = await Promise.all([
    supabase.from("agents").select("id, name, emoji, specialist_domain, status"),
    supabase.from("tasks").select("id, title, status, priority, assigned_agent_id, blocker, owner, created_at, updated_at")
      .or(`updated_at.gte.${dayStart.toISOString()},created_at.gte.${dayStart.toISOString()}`)
      .lte(`updated_at`, dayEnd.toISOString()),
    supabase.from("task_comments").select("content, author, created_at, task_id")
      .gte("created_at", dayStart.toISOString()).lte("created_at", dayEnd.toISOString()),
    supabase.from("task_reviews").select("outcome, notes, created_at, task_id, tasks(title)")
      .gte(`created_at`, dayStart.toISOString()).lte(`created_at`, dayEnd.toISOString()),
    supabase.from("feed_events").select("event_type, summary, related_agent_id, created_at")
      .gte("created_at", dayStart.toISOString()).lte("created_at", dayEnd.toISOString()),
  ]);

  const agents = agentsRes.data || [];
  const tasks = tasksRes.data || [];
  const comments = commentsRes.data || [];
  const reviews = reviewsRes.data || [];
  const feedEvents = feedRes.data || [];

  // Execution analysis
  const completed = tasks.filter((t: any) => t.status === "done").length;
  const blockedTasks = tasks.filter((t: any) => t.status === "blocked");
  const inReviewTasks = tasks.filter((t: any) => t.status === "in-review");
  const unassignedOpen = tasks.filter((t: any) => !t.assigned_agent_id && t.status !== "done");

  // Agent performance
  const agentUpdates = agents.map((agent: any) => {
    const agentTasks = tasks.filter((t: any) => t.assigned_agent_id === agent.id);
    const agentComments = comments.filter((c: any) => c.author === agent.name || c.author === agent.short_id);
    const agentFeed = feedEvents.filter((e: any) => e.related_agent_id === agent.id);
    const completedTasks = agentTasks.filter((t: any) => t.status === "done");
    const blockedAgent = agentTasks.filter((t: any) => t.status === "blocked");
    const inProgress = agentTasks.filter((t: any) => t.status === "in-progress");
    const inReview = agentTasks.filter((t: any) => t.status === "in-review");
    const pending = agentTasks.filter((t: any) => t.status === "pending");
    return {
      name: agent.name,
      emoji: agent.emoji,
      domain: agent.specialist_domain || "general",
      status: agent.status,
      workload: {
        completed: completedTasks.length,
        in_progress: inProgress.length,
        blocked: blockedAgent.length,
        pending: pending.length,
        in_review: inReview.length,
        total_today: agentTasks.length,
      },
      completed_tasks: completedTasks.slice(0, 3).map((t: any) => t.title),
      current_tasks: [...inProgress.slice(0, 2), ...inReview.slice(0, 2)].map((t: any) => t.title),
      blockers: blockedAgent.map((t: any) => t.blocker || "Unknown blocker"),
      events: agentFeed.slice(0, 5).map((e: any) => e.summary),
      outputs: agentComments.length,
      utilization: agentTasks.length === 0 ? (agent.status === "active" ? "idle" : "inactive") : agentTasks.length > 8 ? "overloaded" : "normal",
      weak_output: completedTasks.length === 0 && agentTasks.length > 2,
    };
  });

  // Skill gaps (only missing_skill category)
  const skillGaps = agentUpdates
    .filter((a: any) => a.weak_output || a.utilization === "idle")
    .map((a: any) => ({
      agent: a.name,
      issue: a.weak_output
        ? `${a.name} shows low output despite ${a.workload.total_today} tasks`
        : `${a.name} is idle — no tasks assigned`,
      recommendation: a.weak_output
        ? "Review task complexity or reassign"
        : "Consider assigning tasks or spawning new work",
    }));

  // Wins
  const wins = tasks
    .filter((t: any) => t.status === "done")
    .slice(0, 5).map((t: any) => t.title);

  // Blockers with root-cause tagging
  const blockersList = blockedTasks.map((t: any) => {
    const blocker = t.blocker || t.title;
    let cause = "unknown";
    if (!t.assigned_agent_id) cause = "missing_skill";
    else if (blocker.includes("dependency") || blocker.includes("waiting")) cause = "dependency_blocker";
    else if (blocker.includes("approval") || blocker.includes("review")) cause = "approval_delay";
    else if (blocker.includes("process") || blocker.includes("SOP")) cause = "missing_process";
    else cause = "missing_skill";
    return { task: t.title, blocker, agent: agents.find((a: any) => a.id === t.assigned_agent_id)?.name || "unassigned", cause };
  });

  // Coordination
  const crossTeamSummary = {
    total_blockers: blockedTasks.length,
    total_in_review: inReviewTasks.length,
    unassigned_open: unassignedOpen.length,
    handoffs_today: feedEvents.filter((e: any) => e.event_type === "task_reassigned").length,
    coordination_notes: [
      blockedTasks.length > 0 ? `${blockedTasks.length} task(s) blocked — review needed` : null,
      inReviewTasks.length > 0 ? `${inReviewTasks.length} task(s) awaiting review` : null,
      unassignedOpen.length > 0 ? `${unassignedOpen.length} open task(s) unassigned` : null,
    ].filter(Boolean),
  };

  // Yas decisions
  const yasDecisions: string[] = [];
  if (blockedTasks.length > 0) yasDecisions.push(`Intervene on ${blockedTasks.length} blocked task(s) — reassign or remove blockers`);
  if (inReviewTasks.length > 3) yasDecisions.push(`Clear review backlog of ${inReviewTasks.length} item(s) — priority action`);
  if (skillGaps.length > 0) yasDecisions.push(`Review ${skillGaps.length} agent capability gap(s) — consider skills or reassignment`);
  if (yasDecisions.length === 0) yasDecisions.push("No intervention needed — system running well");

  // Tomorrow priorities
  const prioritiesTomorrow: string[] = [];
  if (blockedTasks.length > 0) prioritiesTomorrow.push(`Resolve ${blockedTasks.length} blocker(s)`);
  if (inReviewTasks.length > 0) prioritiesTomorrow.push(`Review ${inReviewTasks.length} pending item(s)`);
  if (unassignedOpen.length > 0) prioritiesTomorrow.push(`Assign ${unassignedOpen.length} unassigned task(s)`);
  if (prioritiesTomorrow.length === 0) prioritiesTomorrow.push("Maintain current pace");
  while (prioritiesTomorrow.length < 3) prioritiesTomorrow.push("Monitor system health");
  prioritiesTomorrow.splice(5);

  // Overall health
  const health = blockedTasks.length === 0 && inReviewTasks.length < 5 ? "healthy" : "needs_attention";

  // Build report
  const report = {
    date: prevDateStr,
    summary: `Day summary: ${tasks.length} task events, ${completed} completed, ${blockedTasks.length} blocked. System ${health === "healthy" ? "operating normally" : "requires attention"}.`,
    events_reviewed: feedEvents.length,
    decisions: yasDecisions,
    blockers: blockedTasks.map((t: any) => t.blocker ?? t.title),
    priorities_tomorrow: prioritiesTomorrow,
    agent_updates: agentUpdates,
    cross_team_summary: crossTeamSummary,
    skill_gaps: skillGaps,
    issues_list: blockersList.map((b: any) => `[${b.agent}] ${b.task}: ${b.blocker} (${b.cause})`),
    yas_decisions: yasDecisions,
    updated_at: now.toISOString(),
    wins,
  };

  const { data: savedNote, error: saveError } = await supabase
    .from("daily_notes")
    .upsert(report, { onConflict: "date" })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  await supabase.from("feed_events").insert({
    event_type: "daily_sync_generated",
    source: "Yas Claw Cron",
    summary: `Daily sync generated for ${prevDateStr}: ${tasks.length} events, ${completed} completed`,
  });

  return NextResponse.json({ success: true, date: prevDateStr, data: savedNote });
}
