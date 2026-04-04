import { getSupabase } from "@/lib/supabase/client";

export interface AgentUpdate {
  name: string;
  emoji: string;
  workload: { completed: number; in_progress: number; blocked: number; };
  blockers: string[];
  utilization: string;
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

export interface Lesson {
  id: string;
  title: string;
  status: "draft" | "pending" | "approved" | "applied" | "rejected";
  pattern: string;
  affected_agents: string[];
  proposed_fix: string;
  date_detected: string;
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
      // Advanced A-G Fields
      agent_updates: note.agent_updates || [],
      cross_team: note.cross_team_summary || {},
      skill_gaps: note.skill_gaps || [],
    };
  });
}

export async function getSkillRequests(): Promise<SkillRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("skill_requests")
    .select("*")
    .order("created_at", { ascending: false });
  return data || [];
}

export async function getLessons(status?: string): Promise<Lesson[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  let query = supabase.from("lessons").select("*").order("date_detected", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  return data || [];
}

export async function getSystemUpdates(): Promise<SystemUpdate[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from("system_updates")
    .select("*")
    .order("applied_at", { ascending: false });
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
