import { getSupabase } from "@/lib/supabase/client";

function normalizeMaybeArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

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
    const blockers = normalizeMaybeArray<string>(note.blockers);
    const inReview = note.cross_team_summary?.total_in_review || 0;
    return {
      id: note.id,
      date: note.date,
      summary: note.summary,
      health: blockers.length > 0 || inReview > 5 ? "needs_attention" : "healthy",
      wins: normalizeMaybeArray<string>(note.yas_decisions),
      difficulties: blockers,
      findings: normalizeMaybeArray<string>(note.issues_list),
      assigned_actions: normalizeMaybeArray<string>(note.priorities_tomorrow),
      event_count: note.events_reviewed || 0,
      agent_updates: normalizeMaybeArray(note.agent_updates),
      cross_team: note.cross_team_summary || {},
      skill_gaps: normalizeMaybeArray<string>(note.skill_gaps),
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
  try {
    const params = new URLSearchParams()
    if (status && status !== 'all') params.set('status', status)
    const res = await fetch(`/api/lessons?${params.toString()}`)
    if (!res.ok) return []
    const body = await res.json()
    return body.data || []
  } catch {
    return []
  }
}

export async function updateLessonStatus(id: string, status: Lesson["status"], approved_by?: string): Promise<boolean> {
  try {
    const res = await fetch('/api/lessons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, approved_by }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('updateLessonStatus failed:', body.error || res.statusText)
      return false
    }

    // Log to system_updates if status advances
    if (status === 'approved' || status === 'applied') {
      await createSystemUpdate({
        type: 'sop_added',
        title: `Lesson ${status}`,
        description: `Lesson ${id.slice(0, 8)}... marked as ${status}.`,
      })
    }
    return true
  } catch (e) {
    console.error('updateLessonStatus error:', e)
    return false
  }
}

export async function getSystemUpdates(): Promise<SystemUpdate[]> {
  try {
    const res = await fetch('/api/system-updates')
    if (!res.ok) return []
    const body = await res.json()
    return body.data || []
  } catch {
    return []
  }
}

async function createSystemUpdate(input: {
  type: string
  title: string
  description: string
  affected_entities?: string[]
}): Promise<void> {
  try {
    await fetch('/api/system-updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (e) {
    console.error('createSystemUpdate error:', e)
  }
}

export async function approveSkillRequest(id: string) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("skill_requests").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id);
    const { data: req } = await supabase.from("skill_requests").select("*").eq("id", id).single();
    if (req) {
      await createSystemUpdate({
        type: "skill_installed",
        title: `Installed: ${req.title}`,
        description: req.description,
      });
    }
  } catch (e) {
    console.error('approveSkillRequest error:', e);
  }
}

export async function rejectSkillRequest(id: string) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from("skill_requests").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id);
    await createSystemUpdate({
      type: "workflow_changed",
      title: `Rejected Skill Request`,
      description: `Skill request ${id.slice(0, 8)}... reviewed and rejected by Yas.`,
    });
  } catch (e) {
    console.error('rejectSkillRequest error:', e);
  }
}

export async function requestSkill(title: string, description: string, requestedBy: string) {
  const supabase = getSupabase();
  if (!supabase) return null;
  return await supabase.from("skill_requests").insert({ title, description, requested_by: requestedBy }).select().single();
}

export async function createLesson(lesson: Omit<Lesson, "id" | "date_detected">) {
  try {
    const res = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lesson),
    })
    if (!res.ok) return null
    const body = await res.json()
    return body.data || null
  } catch {
    return null
  }
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

export async function getApprovals(status?: ApprovalStatus | 'all'): Promise<Approval[]> {
  try {
    const params = new URLSearchParams()
    if (status && status !== 'all') params.set('status', status)
    const res = await fetch(`/api/approvals?${params.toString()}`)
    if (!res.ok) return []
    const body = await res.json()
    return (body.data || []).map((r: any) => ({ ...r, payload: r.payload ?? {} }))
  } catch {
    return []
  }
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
  try {
    const res = await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, resolved_by }),
    })
    return res.ok
  } catch {
    return false
  }
}
