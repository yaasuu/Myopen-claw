import { getSupabase } from "@/lib/supabase/client";
import type { SystemStatus } from "@/types/dashboard";

const MOCK_STATUS: SystemStatus = {
  id: "mock-1",
  status: "healthy",
  active_agents: 2,
  open_tasks: 4,
  blocked_tasks: 1,
  last_event: new Date(Date.now() - 2 * 60000).toISOString(),
  checked_at: new Date().toISOString(),
};

export async function getSystemStatus(): Promise<{
  data: SystemStatus | null;
  error: string | null;
}> {
  const supabase = getSupabase();

  if (!supabase) {
    return { data: MOCK_STATUS, error: null };
  }

  const { data, error } = await supabase
    .from("system_status")
    .select("*")
    .order("checked_at", { ascending: false })
    .limit(1);

  const row = data?.[0] ?? null;

  if (error) {
    return { data: MOCK_STATUS, error: error.message };
  }

  if (!row) {
    return { data: MOCK_STATUS, error: null };
  }

  return { data: row as SystemStatus, error: null };
}
