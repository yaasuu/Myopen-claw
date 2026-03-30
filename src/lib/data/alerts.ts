import { getSupabase } from "@/lib/supabase/client";
import type { Agent } from "@/types/dashboard";

const MOCK_PAUSED_AGENTS: Agent[] = [
  {
    id: "mock-3",
    name: "Architecture-Systems Agent",
    short_id: "architecture-systems",
    emoji: "🏗️",
    description: "Handles platform design, data modeling, and system architecture",
    status: "paused",
    domain: "Platform design, data modeling, system architecture",
    task_count: 1,
    last_activity: new Date(Date.now() - 2 * 3600000).toISOString(),
    created_at: "2026-03-28T00:00:00Z",
  },
];

export async function getPausedAgents(): Promise<{ data: Agent[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { data: MOCK_PAUSED_AGENTS, error: null };
  }

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("status", "paused");

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as Agent[], error: null };
}
