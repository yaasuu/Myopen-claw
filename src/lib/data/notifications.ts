import { getSupabase } from "@/lib/supabase/client";

export type NotificationType =
  | "blocker_detected"
  | "blocker_resolved"
  | "agent_paused"
  | "agent_resumed"
  | "system_alert"
  | "task_reassigned"
  | "task_completed";

export type NotificationSeverity = "critical" | "warning" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  related_task_id: string | null;
  related_agent_id: string | null;
  is_read: boolean;
  created_at: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-1",
    type: "blocker_detected",
    title: "Task Blocked",
    message: "Supplier readiness check is blocked — waiting on supplier confirmation",
    severity: "critical",
    related_task_id: "mock-2",
    related_agent_id: "mock-1",
    is_read: false,
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: "notif-2",
    type: "agent_paused",
    title: "Agent Paused",
    message: "Architecture-Systems Agent has been paused",
    severity: "warning",
    related_task_id: null,
    related_agent_id: "mock-3",
    is_read: false,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
  },
  {
    id: "notif-3",
    type: "task_completed",
    title: "Task Completed",
    message: "Weekly workflow review has been completed",
    severity: "info",
    related_task_id: "mock-3",
    related_agent_id: "mock-2",
    is_read: true,
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
  },
  {
    id: "notif-4",
    type: "system_alert",
    title: "System Alert",
    message: "System status changed to degraded",
    severity: "critical",
    related_task_id: null,
    related_agent_id: null,
    is_read: true,
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
  },
];

const severityByType: Record<NotificationType, NotificationSeverity> = {
  blocker_detected: "critical",
  blocker_resolved: "info",
  agent_paused: "warning",
  agent_resumed: "info",
  system_alert: "critical",
  task_reassigned: "info",
  task_completed: "info",
};

/**
 * Create a notification from a feed event.
 */
export async function createNotification(params: {
  type: NotificationType;
  title: string;
  message: string;
  related_task_id?: string | null;
  related_agent_id?: string | null;
}): Promise<{ data: Notification | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      type: params.type,
      title: params.title,
      message: params.message,
      severity: severityByType[params.type] ?? "info",
      related_task_id: params.related_task_id ?? null,
      related_agent_id: params.related_agent_id ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Notification, error: null };
}

export async function getNotifications(
  options?: { unreadOnly?: boolean; limit?: number }
): Promise<{ data: Notification[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    let data = MOCK_NOTIFICATIONS;
    if (options?.unreadOnly) data = data.filter((n) => !n.is_read);
    return { data: data.slice(0, options?.limit ?? 50), error: null };
  }

  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Notification[], error: null };
}

export async function getUnreadCount(): Promise<{ count: number; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { count: MOCK_NOTIFICATIONS.filter((n) => !n.is_read).length, error: null };
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function markAsRead(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);

  return { error: error?.message ?? null };
}

export async function markAllAsRead(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);

  return { error: error?.message ?? null };
}
