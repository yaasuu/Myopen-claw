import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type { Agent } from "@/types/dashboard";

export async function getAgents(): Promise<{ data: Agent[]; error: string | null }> {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      data: [
        {
          id: "mock-1",
          name: "Export-Growth Agent",
          short_id: "export-growth",
          emoji: "📦",
          description: "Handles export opportunities, leads, and buyer follow-up",
          status: "active",
          domain: "Export execution, lead generation, buyer follow-up",
          task_count: 5,
          last_activity: new Date(Date.now() - 12 * 60000).toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-2",
          name: "Ops-Improvement Agent",
          short_id: "ops-improvement",
          emoji: "⚙️",
          description: "Handles workflows, process improvement, and routines",
          status: "active",
          domain: "Workflows, process improvement, routines",
          task_count: 4,
          last_activity: new Date(Date.now() - 45 * 60000).toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-3",
          name: "Architecture-Systems Agent",
          short_id: "architecture-systems",
          emoji: "🏗️",
          description: "Handles platform design, data modeling, and system architecture",
          status: "paused",
          domain: "Platform design, data modeling, system architecture",
          task_count: 3,
          last_activity: new Date(Date.now() - 2 * 3600000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    };
  }

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as Agent[], error: null };
}

export async function getAgentById(id: string): Promise<{ data: Agent | null; error: string | null }> {
  const supabase = getSupabase();

  if (!supabase) {
    const { data } = await getAgents();
    return { data: data.find((a) => a.id === id) ?? null, error: null };
  }

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Agent, error: null };
}

export async function updateAgentProfile(
  id: string,
  updates: Partial<Pick<Agent, "name" | "emoji" | "description" | "domain">>
): Promise<{ data: Agent | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("agents")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const agent = data as Agent;

  await logFeedEvent({
    event_type: "task_updated",
    source: "system",
    summary: `Agent '${agent.name}' profile updated`,
    related_agent_id: agent.id,
  });

  return { data: agent, error: null };
}

export async function updateAgentStatus(
  id: string,
  status: "active" | "paused"
): Promise<{ data: Agent | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("agents")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const agent = data as Agent;

  await logFeedEvent({
    event_type: status === "paused" ? "agent_paused" : "agent_resumed",
    source: "system",
    summary: status === "paused"
      ? `Agent '${agent.name}' paused`
      : `Agent '${agent.name}' resumed`,
    related_agent_id: agent.id,
  });

  return { data: agent, error: null };
}
