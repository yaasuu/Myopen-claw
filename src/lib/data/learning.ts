import { getSupabase } from "@/lib/supabase/client";

export interface AgentUpdate {
  name: string;
  emoji: string;
  workload: { completed: number; in_progress: number; blocked: number; };
  blockers: string[];
  utilization: string;
}

export interface AgentPerformance {
  name: string;
  emoji: string;
  total: number;
  completed: number;
  blocked: number;
  inReview: number;
  inProgress: number;
  pending: number;
  completionRate: number;
  blockers: string[];
}

export interface MeetingSummary {
  id: string;
  date: string;
  summary: string;
  health: "healthy" | "needs_attention" | "critical";
  wins: string[];
  difficulties: string[];
  findings: string[];
  assigned_actions: string[];
  event_count: number;
  agent_updates: AgentUpdate[];
  cross_team: any;
  skill_gaps: string[];
}

export interface Lesson {
  id: string;
  title: string;
  status: "draft" | "pending" | "approved" | "applied" | "rejected";
  pattern: string;
  affected_agents: string[];
  proposed_fix: string;
  lesson_statement: string;
  date_detected: string;
}

export interface SkillRequest {
  id: string;
  title: string;
  description: string;
  requested_by: string;
  affected_agent: string;
  status: "pending" | "approved" | "rejected" | "installed";
  created_at: string;
}

export interface SystemUpdate {
  id: string;
  type: "skill_installed" | "prompt_updated" | "sop_added" | "workflow_changed";
  title: string;
  description: string;
  applied_at: string;
}

export async function getDailySyncs(limit = 10): Promise<MeetingSummary[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("daily_notes")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((note: any) => {
    const blockers = note.blockers || [];
    const inReview = note.cross_team_summary?.total_in_review || 0;
    return {
      id: note.id,
      date: note.date,
      summary: note.summary,
      health: blockers.length > 0 || inReview > 5 ? "needs_attention" : "healthy",
      wins: note.yas_decisions || [],
      difficulties: blockers,
      findings: note.issues_list || [],
      assigned_actions: note.priorities_tomorrow || [],
      event_count: note.events_reviewed || 0,
      agent_updates: note.agent_updates || [],
      cross_team: note.cross_team_summary || {},
      skill_gaps: note.skill_gaps || [],
    };
  });
}

export async function getAgentPerformance(): Promise<AgentPerformance[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: agents } = await supabase.from("agents").select("id, name, emoji").order("created_at", { ascending: true });
  const { data: tasks } = await supabase.from("tasks").select("id, title, status, blocker, assigned_agent_id");

  if (!agents || !tasks) return [];

  return agents.map((agent: any) => {
    const agentTasks = tasks.filter((t: any) => t.assigned_agent_id === agent.id);
    const completed = agentTasks.filter((t: any) => t.status === "done").length;
    const blocked = agentTasks.filter((t: any) => t.status === "blocked");
    const inReview = agentTasks.filter((t: any) => t.status === "in-review").length;
    const inProgress = agentTasks.filter((t: any) => t.status === "in-progress").length;
    const pending = agentTasks.filter((t: any) => t.status === "pending").length;
    const total = agentTasks.length;
    return {
      name: agent.name,
      emoji: agent.emoji,
      total,
      completed,
      blocked: blocked.length,
      inReview,
      inProgress,
      pending,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      blockers: blocked.map((t: any) => t.blocker || "Unknown").slice(0, 3),
    };
  });
}

export async function getSkillRequests(): Promise<SkillRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from("skill_requests").select("*").order("created_at", { ascending: false });
  return data || [];
}

export async function getLessons(status?: string): Promise<Lesson[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  let query = supabase.from("lessons").select("*").order("date_detected", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return data || [];
}

export async function updateLessonStatus(id: string, status: Lesson["status"]): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from("lessons").update({ status }).eq("id", id);
  if (error) return false;

  // Log to system_updates if status advances to approved or applied
  if (status === "approved" || status === "applied") {
    await supabase.from("system_updates").insert({
      type: "sop_added",
      title: `Lesson ${status}: "${id.slice(0, 8)}..."`,
      description: `Lesson marked as ${status}.`,
      applied_at: new Date().toISOString(),
    });
  }
  return true;
}

export async function getSystemUpdates(): Promise<SystemUpdate[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from("system_updates").select("*").order("applied_at", { ascending: false });
  return data || [];
}

export async function approveSkillRequest(id: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("skill_requests").update({ status: "installed", updated_at: new Date().toISOString() }).eq("id", id);
  const { data: req } = await supabase.from("skill_requests").select("*").eq("id", id).single();
  if (req) {
    await supabase.from("system_updates").insert({
      type: "skill_installed",
      title: `Installed: ${req.title}`,
      description: req.description,
      source_approval_id: id,
      applied_at: new Date().toISOString()
    });
  }
}

export async function rejectSkillRequest(id: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("skill_requests").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id);
  await supabase.from("system_updates").insert({
    type: "workflow_changed",
    title: `Rejected Skill Request ${id}`,
    description: "Skill request reviewed and rejected by Yas.",
    source_approval_id: id,
    applied_at: new Date().toISOString()
  });
}

export async function requestSkill(title: string, description: string, requestedBy: string) {
  const supabase = getSupabase();
  if (!supabase) return null;
  return await supabase.from("skill_requests").insert({ title, description, requested_by: requestedBy }).select().single();
}

export async function createLesson(lesson: Omit<Lesson, "id" | "date_detected">) {
  const supabase = getSupabase();
  if (!supabase) return null;
  return await supabase.from("lessons").insert(lesson).select().single();
}

// ─── Typed Approvals ───

export type ApprovalType = "agent_hire" | "strategy_change" | "budget_override" | "lesson_approval" | "skill_installation" | "task_review";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "revision_requested";

export interface Approval {
  id: string;
  approval_type: ApprovalType;
  description: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requested_by: string;
  requested_for_agent_id: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export const APPROVAL_LABELS: Record<ApprovalType, string> = {
  task_review: "Task Review",
  agent_hire: "Agent Hire",
  strategy_change: "Strategy Change",
  budget_override: "Budget Override",
  lesson_approval: "Lesson Approval",
  skill_installation: "Skill Installation",
};

export async function getApprovals(status?: ApprovalStatus): Promise<Approval[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  let query = supabase.from("approvals").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data || []).map((r: any) => ({ ...r, payload: r.payload ?? {} }));
}

export async function createApproval(input: {
  approval_type: ApprovalType;
  description: string;
  payload?: Record<string, unknown>;
  requested_by?: string;
  requested_for_agent_id?: string | null;
}): Promise<Approval | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("approvals").insert({
    approval_type: input.approval_type,
    description: input.description,
    payload: input.payload ?? {},
    requested_by: input.requested_by ?? "System",
    requested_for_agent_id: input.requested_for_agent_id ?? null,
    status: "pending",
  }).select().single();
  if (error) return null;
  return data as Approval;
}

export async function resolveApproval(
  id: string,
  status: "approved" | "rejected" | "revision_requested",
  resolved_by: string = "Yas"
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from("approvals").update({
    status,
    resolved_at: new Date().toISOString(),
    resolved_by,
  }).eq("id", id);
  if (error) return false;

  if (status === "approved") {
    const { data: approval } = await supabase.from("approvals").select("*").eq("id", id).single();
    if (approval) {
      const updateType = approval.approval_type === "skill_installation" ? "skill_installed" : "workflow_changed";
      await supabase.from("system_updates").insert({
        type: updateType,
        title: `Approved: ${APPROVAL_LABELS[approval.approval_type as ApprovalType] || approval.approval_type}`,
        description: approval.description,
        applied_at: new Date().toISOString(),
      });
    }
  }
  return true;
}
