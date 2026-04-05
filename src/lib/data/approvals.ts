import { getSupabase } from "@/lib/supabase/client";

export type ApprovalType = 
  | "task_review"
  | "agent_hire"
  | "strategy_change"
  | "budget_override"
  | "lesson_approval"
  | "skill_installation";

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
  return (data || []).map((r: any) => ({
    ...r,
    payload: r.payload ?? {},
  }));
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

  // Log to system_updates if approved
  if (status === "approved") {
    const { data: approval } = await supabase.from("approvals").select("*").eq("id", id).single();
    if (approval) {
      await supabase.from("system_updates").insert({
        type: approval.approval_type === "skill_installation" ? "skill_installed" : "workflow_changed",
        title: `Approved: ${APPROVAL_LABELS[approval.approval_type as ApprovalType] || String(approval.approval_type)}`,
        description: approval.description,
        applied_at: new Date().toISOString(),
      });
    }
  }
  return true;
}
