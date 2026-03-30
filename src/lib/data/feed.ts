import { getSupabase } from "@/lib/supabase/client";
import type { FeedEvent } from "@/types/dashboard";

const MOCK_EVENTS: FeedEvent[] = [
  {
    id: "mock-1",
    event_type: "task_created",
    source: "system",
    summary: "New task 'Review export docs' created",
    related_task_id: null,
    related_agent_id: null,
    created_at: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: "mock-2",
    event_type: "agent_routed",
    source: "Yas Claw",
    summary: "Task assigned to Export-Growth Agent",
    related_task_id: null,
    related_agent_id: null,
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: "mock-3",
    event_type: "task_completed",
    source: "Ops-Improvement",
    summary: "Completed: Weekly workflow review",
    related_task_id: null,
    related_agent_id: null,
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: "mock-4",
    event_type: "blocker_detected",
    source: "system",
    summary: "Blocker detected on 'Supplier quote' — overdue 3 days",
    related_task_id: null,
    related_agent_id: null,
    created_at: new Date(Date.now() - 40 * 60000).toISOString(),
  },
  {
    id: "mock-5",
    event_type: "agent_paused",
    source: "Yas Claw",
    summary: "Architecture-Systems Agent paused",
    related_task_id: null,
    related_agent_id: null,
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
  },
];

export async function getFeedEvents(limit = 20): Promise<{ data: FeedEvent[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_EVENTS.slice(0, limit), error: null };

  const { data, error } = await supabase
    .from("feed_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as FeedEvent[], error: null };
}

export async function getFeedEventsByType(
  type: FeedEvent["event_type"],
  limit = 20
): Promise<{ data: FeedEvent[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_EVENTS.filter((e) => e.event_type === type).slice(0, limit), error: null };

  const { data, error } = await supabase
    .from("feed_events")
    .select("*")
    .eq("event_type", type)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as FeedEvent[], error: null };
}
