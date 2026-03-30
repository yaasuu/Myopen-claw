import { getSupabase } from "@/lib/supabase/client";
import { createNotification, type NotificationType } from "@/lib/data/notifications";
import type { FeedEvent } from "@/types/dashboard";

export type FeedEventType = FeedEvent["event_type"];

// Maps feed event types to notification types (only critical ones)
const NOTIFICATION_MAP: Record<string, { type: NotificationType; title: string }> = {
  blocker_detected: { type: "blocker_detected", title: "Task Blocked" },
  blocker_resolved: { type: "blocker_resolved", title: "Blocker Resolved" },
  agent_paused: { type: "agent_paused", title: "Agent Paused" },
  agent_resumed: { type: "agent_resumed", title: "Agent Resumed" },
  agent_hired: { type: "agent_resumed", title: "Agent Hired" },
  system_alert: { type: "system_alert", title: "System Alert" },
  agent_routed: { type: "task_reassigned", title: "Task Reassigned" },
  task_completed: { type: "task_completed", title: "Task Completed" },
};

export async function logFeedEvent(params: {
  event_type: FeedEventType;
  source?: string;
  summary: string;
  related_task_id?: string | null;
  related_agent_id?: string | null;
}): Promise<{ data: FeedEvent | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("feed_events")
    .insert({
      event_type: params.event_type,
      source: params.source ?? "system",
      summary: params.summary,
      related_task_id: params.related_task_id ?? null,
      related_agent_id: params.related_agent_id ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Auto-generate notification for relevant event types
  const notifConfig = NOTIFICATION_MAP[params.event_type];
  if (notifConfig) {
    await createNotification({
      type: notifConfig.type,
      title: notifConfig.title,
      message: params.summary,
      related_task_id: params.related_task_id,
      related_agent_id: params.related_agent_id,
    });
  }

  return { data: data as FeedEvent, error: null };
}
