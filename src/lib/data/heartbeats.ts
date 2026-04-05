import { getSupabase } from "@/lib/supabase/client";

export interface HeartbeatRun {
  id: string;
  agent_id: string | null;
  agent_name?: string;
  agent_emoji?: string;
  run_status: "running" | "completed" | "failed" | "skipped";
  summary: string;
  detail: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  next_due_at: string | null;
}

export interface LiveAgentRun {
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  run_id: string;
  status: string;
  started_at: string;
  summary: string;
}

export async function recordHeartbeat(input: {
  agent_id: string;
  run_status?: HeartbeatRun["run_status"];
  summary?: string;
  detail?: Record<string, unknown>;
  next_due_at?: string;
}): Promise<HeartbeatRun | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.from("heartbeat_runs").insert({
    agent_id: input.agent_id,
    run_status: input.run_status ?? "running",
    summary: input.summary ?? "",
    detail: input.detail ?? {},
    next_due_at: input.next_due_at ?? null,
    completed_at: input.run_status === "completed" ? new Date().toISOString() : null,
    started_at: new Date().toISOString(),
  }).select().single();

  if (error) return null;
  return data as HeartbeatRun;
}

export async function getLiveAgentRuns(): Promise<LiveAgentRun[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // last 10 min

  // Get latest heartbeat per agent
  const { data: runs } = await supabase
    .from("heartbeat_runs")
    .select("*, agents(name, emoji)")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false });

  if (!runs || runs.length === 0) return [];

  // Deduplicate: keep only latest run per agent
  const seen = new Set<string>();
  const unique: any[] = [];
  for (const run of runs) {
    if (!seen.has(run.agent_id)) {
      seen.add(run.agent_id);
      unique.push(run);
    }
  }

  return unique.map((run: any) => ({
    agent_id: run.agent_id,
    agent_name: run.agents?.name ?? "Unknown Agent",
    agent_emoji: run.agents?.emoji ?? "🤖",
    run_id: run.id,
    status: run.run_status,
    started_at: run.started_at,
    summary: run.summary,
  }));
}

export async function getRecentHeartbeats(limit = 50): Promise<HeartbeatRun[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from("heartbeat_runs")
    .select("*, agents(name, emoji)")
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data || []).map((run: any) => ({
    ...run,
    agent_name: run.agents?.name ?? "Unknown",
    agent_emoji: run.agents?.emoji ?? "🤖",
  }));
}
