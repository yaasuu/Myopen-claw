import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type { Agent } from "@/types/dashboard";

export async function getAgents(): Promise<{ data: Agent[]; error: string | null }> {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      data: [
        {
          id: "mock-0",
          name: "Yas Claw",
          short_id: "yas-claw",
          emoji: "🦀",
          description: "CEO orchestrator — creates tasks, assigns to agents, monitors, approves completion",
          status: "active",
          domain: "Orchestration, task management, agent coordination, approval",
          task_count: 0,
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
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
          status: "active",
          domain: "Platform design, data modeling, system architecture",
          task_count: 3,
          last_activity: new Date(Date.now() - 2 * 3600000).toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-4",
          name: "UI/UX Designer",
          short_id: "ui-ux-designer",
          emoji: "🎨",
          description: "Designs and improves interface clarity, interaction flows, dashboard usability, and visual consistency",
          status: "active",
          domain: "Interface design, flow improvement, interaction clarity, dashboard polish",
          task_count: 0,
          last_activity: null,
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-5",
          name: "Data Analyst",
          short_id: "data-analyst",
          emoji: "📊",
          description: "Analyzes metrics, reporting patterns, KPI performance, and operational data for decision support",
          status: "active",
          domain: "Analytics, reporting, KPI interpretation, metrics review, business intelligence",
          task_count: 0,
          last_activity: null,
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-6",
          name: "Research Agent",
          short_id: "research-agent",
          emoji: "🔬",
          description: "Performs structured research, comparative analysis, investigation, and insight synthesis",
          status: "active",
          domain: "Market research, comparative analysis, structured investigation, synthesis",
          task_count: 0,
          last_activity: null,
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-7",
          name: "Quality Assurance Agent",
          short_id: "qa-agent",
          emoji: "✅",
          description: "Reviews work quality before CEO approval. Checks completeness, accuracy, and consistency",
          status: "active",
          domain: "Quality review, completeness check, accuracy verification, consistency audit",
          task_count: 0,
          last_activity: null,
          created_at: new Date().toISOString(),
        },
        {
          id: "mock-7",
          name: "Executive Finance Agent",
          short_id: "executive-finance",
          emoji: "💰",
          description: "Personal finance visibility — tracks household cash flow, spending patterns, grocery planning, and budget monitoring for home purposes",
          status: "active",
          domain: "Personal finance, cash spending, grocery planning, household budget, spending visibility",
          task_count: 0,
          last_activity: null,
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
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Agent not found" };
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

export async function createAgent(input: {
  name: string;
  emoji: string;
  description: string;
  domain: string;
}): Promise<{ data: Agent | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const shortId = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const { data, error } = await supabase
    .from("agents")
    .insert({
      name: input.name,
      short_id: shortId,
      emoji: input.emoji || "🤖",
      description: input.description,
      domain: input.domain,
      status: "active",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const agent = data as Agent;

  await logFeedEvent({
    event_type: "agent_hired",
    source: "system",
    summary: `New agent '${agent.name}' hired`,
    related_agent_id: agent.id,
  });

  return { data: agent, error: null };
}
