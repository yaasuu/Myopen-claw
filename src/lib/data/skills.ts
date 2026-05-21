import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type {
  Skill,
  AgentSkill,
  SkillRequest,
  SkillScanResult,
  SkillRequestStatus,
  Agent,
  TaskWithAgent,
} from "@/types/dashboard";

// ── Constants ────────────────────────────────────────

const SKILLS_PER_MONTH = 2;

// ── Security Scanner ─────────────────────────────────

const DANGEROUS_PATTERNS = [
  /\b(rm\s+-rf|sudo\s+|chmod\s+777|curl\s+.*\|\s*(ba)?sh)\b/i,
  /\b(exec|eval|system|spawn|child_process)\s*\(/i,
  /\b(process\.env|os\.environ|getenv)\b/i,
  /\b(fetch|http\.get|axios|request)\s*\(.*https?:/i,
  /\b(__import__|importlib|require)\s*\(/i,
  /\b(password|secret|token|api_key|credential)\b/i,
  /\b(base64|atob|btoa)\s*\(/i,
  /\b(nmap|metasploit|burpsuite|sqlmap)\b/i,
];

const SUSPICIOUS_PATTERNS = [
  /\b(document|window|globalThis|self)\b/i,
  /\b(localStorage|sessionStorage|indexedDB)\b/i,
  /\b(navigator|location)\.(href|reload|assign)\b/i,
  /\b(setTimeout|setInterval)\s*\(/i,
  /\b(FileReader|Blob|File)\b/i,
];

export function scanSkillContent(content: string): { result: SkillScanResult; notes: string } {
  const issues: string[] = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      issues.push(`🔴 Dangerous pattern: \`${matches[0]}\``);
    }
  }

  if (issues.length > 0) {
    return {
      result: "blocked",
      notes: `Security scan BLOCKED — ${issues.length} dangerous pattern(s) found:\n${issues.join("\n")}`,
    };
  }

  for (const pattern of SUSPICIOUS_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      issues.push(`⚠️ Suspicious pattern: \`${matches[0]}\``);
    }
  }

  if (issues.length > 0) {
    return {
      result: "suspicious",
      notes: `Security scan flagged — ${issues.length} suspicious pattern(s) found:\n${issues.join("\n")}`,
    };
  }

  return {
    result: "clean",
    notes: "Security scan passed — no dangerous or suspicious patterns detected.",
  };
}

// ── Mock Data ────────────────────────────────────────

const MOCK_SKILLS: Skill[] = [
  { id: "sk-1", name: "weather", source: "clawhub", category: "utility", description: "Get current weather and forecasts via wttr.in or Open-Meteo", installed_at: "2026-03-15T00:00:00Z" },
  { id: "sk-2", name: "github", source: "clawhub", category: "development", description: "GitHub CLI operations — repos, PRs, issues, actions", installed_at: "2026-03-20T00:00:00Z" },
  { id: "sk-3", name: "healthcheck", source: "clawhub", category: "operations", description: "Host security hardening and risk-tolerance configuration", installed_at: "2026-03-25T00:00:00Z" },
];

const MOCK_AGENT_SKILLS: AgentSkill[] = [
  { agent_id: "mock-1", skill_id: "sk-1", skill_name: "weather", skill_category: "utility", installed_at: "2026-03-15T00:00:00Z", month_installed: "2026-03" },
  { agent_id: "mock-2", skill_id: "sk-3", skill_name: "healthcheck", skill_category: "operations", installed_at: "2026-03-25T00:00:00Z", month_installed: "2026-03" },
  { agent_id: "mock-3", skill_id: "sk-2", skill_name: "github", skill_category: "development", installed_at: "2026-03-20T00:00:00Z", month_installed: "2026-03" },
];

const MOCK_REQUESTS: SkillRequest[] = [
  {
    id: "sr-1",
    agent_id: "mock-1",
    agent_name: "Export-Growth Agent",
    agent_emoji: "📦",
    skill_name: "trello",
    skill_source: "clawhub",
    skill_category: "project-management",
    skill_description: "Manage Trello boards, lists, and cards",
    reason: "3 blocked tasks related to shipment tracking require board management capability",
    evidence_task_ids: ["mock-4"],
    urgency: "high",
    status: "pending",
    scan_result: "clean",
    scan_notes: "Security scan passed",
    requested_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    reviewed_at: null,
    reviewed_by: null,
  },
  {
    id: "sr-2",
    agent_id: "mock-2",
    agent_name: "Ops-Improvement Agent",
    agent_emoji: "⚙️",
    skill_name: "notion",
    skill_source: "clawhub",
    skill_category: "productivity",
    skill_description: "Read/write Notion pages and databases",
    reason: "Workflow documentation tasks need Notion integration",
    evidence_task_ids: [],
    urgency: "medium",
    status: "pending",
    scan_result: "pending",
    scan_notes: "",
    requested_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    reviewed_at: null,
    reviewed_by: null,
  },
];

// ── Skill CRUD ───────────────────────────────────────

export async function getSkills(): Promise<{ data: Skill[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_SKILLS, error: null };

  const { data, error } = await supabase.from("skills").select("*");
  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as Skill[];
  rows.sort((a, b) => {
    const aTime = new Date((a as any).installed_at ?? 0).getTime();
    const bTime = new Date((b as any).installed_at ?? 0).getTime();
    return bTime - aTime;
  });

  return { data: rows, error: null };
}

export async function getAgentSkills(agentId?: string): Promise<{ data: AgentSkill[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    let data = MOCK_AGENT_SKILLS;
    if (agentId) data = data.filter((s) => s.agent_id === agentId);
    return { data, error: null };
  }

  let query = supabase.from("agent_skills").select("*");
  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as AgentSkill[], error: null };
}

export async function getMonthlySkillCount(agentId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return MOCK_AGENT_SKILLS.filter((s) => s.agent_id === agentId && s.month_installed === month).length;
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { count } = await supabase
    .from("agent_skills")
    .select("*", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("month_installed", month);

  return count ?? 0;
}

// ── Skill Requests ───────────────────────────────────

export async function getSkillRequests(options?: {
  status?: SkillRequestStatus;
}): Promise<{ data: SkillRequest[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    let data = MOCK_REQUESTS;
    if (options?.status) data = data.filter((r) => r.status === options.status);
    return { data, error: null };
  }

  let query = supabase.from("skill_requests").select("*").order("requested_at", { ascending: false });
  if (options?.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as SkillRequest[], error: null };
}

export async function createSkillRequest(input: {
  agentId: string;
  skillName: string;
  skillSource?: string;
  skillCategory?: string;
  skillDescription?: string;
  reason: string;
  evidenceTaskIds?: string[];
  urgency?: "high" | "medium" | "low";
}): Promise<{ data: SkillRequest | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  // Run security scan on skill description
  const scan = scanSkillContent(input.skillDescription ?? "");

  // If blocked, reject immediately
  if (scan.result === "blocked") {
    await logFeedEvent({
      event_type: "skill_scan_flagged",
      source: "Security Auditor",
      summary: `Skill '${input.skillName}' BLOCKED — dangerous patterns detected`,
      related_agent_id: input.agentId,
    });
    return { data: null, error: `Skill blocked by security scan: ${scan.notes}` };
  }

  const { data, error } = await supabase
    .from("skill_requests")
    .insert({
      agent_id: input.agentId,
      skill_name: input.skillName,
      skill_source: input.skillSource ?? "clawhub",
      skill_category: input.skillCategory ?? "",
      skill_description: input.skillDescription ?? "",
      reason: input.reason,
      evidence_task_ids: input.evidenceTaskIds ?? [],
      urgency: input.urgency ?? "medium",
      scan_result: scan.result,
      scan_notes: scan.notes,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const req = data as SkillRequest;

  await logFeedEvent({
    event_type: "skill_requested",
    source: "system",
    summary: `Skill '${req.skill_name}' requested for agent — ${req.reason}`,
    related_agent_id: req.agent_id,
  });

  if (scan.result === "suspicious") {
    await logFeedEvent({
      event_type: "skill_scan_flagged",
      source: "Security Auditor",
      summary: `Skill '${req.skill_name}' flagged as suspicious — manual review needed`,
      related_agent_id: req.agent_id,
    });
  }

  return { data: req, error: null };
}

export async function approveSkillRequest(
  requestId: string,
  reviewedBy: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  // Get the request
  const { data: reqData, error: reqError } = await supabase
    .from("skill_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (reqError || !reqData) return { error: reqError?.message ?? "Request not found" };
  const req = reqData as SkillRequest;

  // Check quota
  const monthCount = await getMonthlySkillCount(req.agent_id);
  if (monthCount >= SKILLS_PER_MONTH) {
    return { error: `Agent already has ${SKILLS_PER_MONTH} skills this month. Quota exceeded.` };
  }

  // Create skill if not exists
  const { data: skillData } = await supabase
    .from("skills")
    .upsert({ name: req.skill_name, source: req.skill_source, category: req.skill_category, description: req.skill_description }, { onConflict: "name" })
    .select()
    .single();

  if (skillData) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Link skill to agent
    await supabase.from("agent_skills").insert({
      agent_id: req.agent_id,
      skill_id: skillData.id,
      month_installed: month,
    });
  }

  // Update request status
  await supabase
    .from("skill_requests")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy })
    .eq("id", requestId);

  await logFeedEvent({
    event_type: "skill_approved",
    source: reviewedBy,
    summary: `Skill '${req.skill_name}' approved for agent`,
    related_agent_id: req.agent_id,
  });

  return { error: null };
}

export async function rejectSkillRequest(
  requestId: string,
  reviewedBy: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { data: reqData } = await supabase
    .from("skill_requests")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy })
    .eq("id", requestId)
    .select()
    .single();

  if (reqData) {
    await logFeedEvent({
      event_type: "skill_rejected",
      source: reviewedBy,
      summary: `Skill '${(reqData as SkillRequest).skill_name}' rejected`,
      related_agent_id: (reqData as SkillRequest).agent_id,
    });
  }

  return { error: null };
}

// ── Gap Analysis ─────────────────────────────────────

export function analyzeSkillGaps(
  tasks: TaskWithAgent[],
  agents: Agent[],
  agentSkills: AgentSkill[]
): Array<{
  agent: Agent;
  missingSkill: string;
  reason: string;
  evidence: string[];
  urgency: "high" | "medium" | "low";
}> {
  const gaps: Array<{
    agent: Agent;
    missingSkill: string;
    reason: string;
    evidence: string[];
    urgency: "high" | "medium" | "low";
  }> = [];

  const SKILL_KEYWORDS: Record<string, string[]> = {
    weather: ["weather", "forecast", "temperature"],
    github: ["github", "repo", "pull request", "commit", "branch"],
    trello: ["trello", "board", "kanban", "card"],
    notion: ["notion", "documentation", "wiki", "notes"],
    healthcheck: ["security", "audit", "hardening", "vulnerability"],
    discord: ["discord", "community", "server"],
    slack: ["slack", "channel", "workspace"],
    "gh-issues": ["issue", "bug", "feature request"],
    asana: ["board", "list", "card", "project board"],
  };

  for (const agent of agents) {
    const agentTaskList = tasks.filter(
      (t) => t.assigned_agent_id === agent.id && t.status !== "done"
    );
    const agentSkillNames = new Set(
      agentSkills.filter((s) => s.agent_id === agent.id).map((s) => s.skill_name)
    );

    // Count keyword matches for each skill
    const skillMatches = new Map<string, string[]>();
    for (const task of agentTaskList) {
      const text = `${task.title} ${task.description} ${task.blocker ?? ""}`.toLowerCase();
      for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
        if (agentSkillNames.has(skill)) continue;
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            const existing = skillMatches.get(skill) ?? [];
            if (!existing.includes(task.id)) {
              existing.push(task.id);
              skillMatches.set(skill, existing);
            }
          }
        }
      }
    }

    for (const [skill, taskIds] of skillMatches) {
      if (taskIds.length >= 2) {
        const blockedCount = taskIds.filter(
          (id) => tasks.find((t) => t.id === id)?.status === "blocked"
        ).length;

        gaps.push({
          agent,
          missingSkill: skill,
          reason: `${taskIds.length} tasks reference '${skill}' capability but agent doesn't have this skill`,
          evidence: taskIds,
          urgency: blockedCount >= 2 ? "high" : taskIds.length >= 3 ? "medium" : "low",
        });
      }
    }
  }

  return gaps.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.urgency] - order[b.urgency];
  });
}
