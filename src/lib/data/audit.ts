import { getSupabase } from "@/lib/supabase/client";

export type AuditAction =
  | "task_create"
  | "task_update"
  | "task_status_change"
  | "task_reassign"
  | "task_archive"
  | "task_unarchive"
  | "task_unblock"
  | "agent_status_change"
  | "agent_profile_update";

export async function logAudit(params: {
  action: AuditAction;
  targetType: "task" | "agent" | "system";
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from("audit_log").insert({
    actor_id: user?.id ?? null,
    actor_email: user?.email ?? "unknown",
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    metadata: params.metadata ?? {},
  });
}
