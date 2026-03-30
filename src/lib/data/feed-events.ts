import { getSupabase } from "@/lib/supabase/client";
import type { FeedEvent } from "@/types/dashboard";

export type FeedEventType = FeedEvent["event_type"];

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
  return { data: data as FeedEvent, error: null };
}
