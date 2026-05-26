import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/cron/skill-gap-detection
 *
 * Server-side skill gap detection + auto-request creation.
 * Designed to be called by a cron job (Vercel Cron, Hermes cron, etc.)
 *
 * Workflow:
 * 1. Fetch all active agents, their tasks, and their installed skills
 * 2. Analyze blocked tasks + task keywords for skill gaps
 * 3. Auto-create skill_requests for high-confidence gaps
 * 4. Auto-create capability_gaps entries for tracking
 * 5. Log everything to feed_events + system_updates
 */

// ── Skill keyword mapping ─────────────────────────────
const SKILL_KEYWORDS: Record<string, { keywords: string[]; category: string; description: string }> = {
  weather: {
    keywords: ["weather", "forecast", "temperature", "rain", "climate"],
    category: "utility",
    description: "Get current weather and forecasts via wttr.in or Open-Meteo",
  },
  github: {
    keywords: ["github", "repo", "pull request", "commit", "branch", "pr", "merge"],
    category: "development",
    description: "GitHub CLI operations — repos, PRs, issues, actions",
  },
  trello: {
    keywords: ["trello", "board", "kanban card", "trello board"],
    category: "project-management",
    description: "Manage Trello boards, lists, and cards",
  },
  notion: {
    keywords: ["notion", "wiki", "documentation page", "notion page"],
    category: "productivity",
    description: "Read/write Notion pages and databases",
  },
  healthcheck: {
    keywords: ["security audit", "hardening", "vulnerability scan", "security check"],
    category: "operations",
    description: "Host security hardening and risk-tolerance configuration",
  },
  discord: {
    keywords: ["discord", "discord server", "discord channel"],
    category: "communication",
    description: "Discord server and channel management",
  },
  slack: {
    keywords: ["slack", "slack channel", "slack workspace"],
    category: "communication",
    description: "Slack messaging and workspace management",
  },
  "gh-issues": {
    keywords: ["github issue", "bug report", "feature request", "issue tracker"],
    category: "development",
    description: "GitHub issues management — create, triage, close",
  },
  asana: {
    keywords: ["asana", "asana project", "asana task"],
    category: "project-management",
    description: "Asana project and task management",
  },
  jira: {
    keywords: ["jira", "sprint", "jira ticket", "jira board", "backlog"],
    category: "project-management",
    description: "Jira project management, sprints, and ticket tracking",
  },
  sheets: {
    keywords: ["spreadsheet", "google sheets", "excel", "csv export", "data export"],
    category: "productivity",
    description: "Spreadsheet read/write operations",
  },
  calendar: {
    keywords: ["calendar", "schedule", "meeting", "appointment", "event"],
    category: "productivity",
    description: "Calendar management and scheduling",
  },
  email: {
    keywords: ["email", "send mail", "inbox", "smtp", "outlook"],
    category: "communication",
    description: "Email sending, receiving, and inbox management",
  },
  maps: {
    keywords: ["map", "location", "geocode", "route", "distance", "address"],
    category: "utility",
    description: "Geocoding, routing, and location lookup",
  },
  ocr: {
    keywords: ["ocr", "scan document", "extract text", "pdf text"],
    category: "utility",
    description: "OCR and document text extraction",
  },
  financial: {
    keywords: ["financial", "invoice", "payment", "budget", "cost", "pricing", "revenue"],
    category: "finance",
    description: "Financial data processing and analysis",
  },
  reporting: {
    keywords: ["report", "dashboard", "analytics", "metrics", "kpi"],
    category: "analytics",
    description: "Report generation and analytics",
  },
};

function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key);

  // ── 1. Fetch all data ─────────────────────────────────
  const [agentsRes, tasksRes, agentSkillsRes, existingRequestsRes, existingGapsRes] = await Promise.all([
    supabase.from("agents").select("*").eq("status", "active"),
    supabase.from("tasks").select("*").neq("status", "done"),
    supabase.from("agent_skills").select("*, skills(name)"),
    supabase.from("skill_requests").select("*").eq("status", "pending"),
    supabase.from("capability_gaps").select("*").in("review_status", ["pending", "approved", "monitored"]),
  ]);

  const agents = agentsRes.data || [];
  const tasks = tasksRes.data || [];
  const agentSkills = agentSkillsRes.data || [];
  const existingRequests = existingRequestsRes.data || [];
  const existingGaps = existingGapsRes.data || [];

  const results = {
    gapsDetected: 0,
    requestsCreated: 0,
    capabilityGapsCreated: 0,
    capabilityGapsUpdated: 0,
    errors: [] as string[],
  };

  // ── 2. Analyze each agent ─────────────────────────────
  for (const agent of agents) {
    const agentId = agent.id;
    const agentTasks = tasks.filter((t: any) => t.assigned_agent_id === agentId);
    const installedSkillNames = new Set(
      agentSkills
        .filter((s: any) => s.agent_id === agentId)
        .map((s: any) => s.skills?.name || s.skill_name)
    );

    // ── 2a. Keyword-based gap detection ─────────────────
    const skillMatches = new Map<string, { taskIds: string[]; blockedCount: number }>();

    for (const task of agentTasks) {
      const text = `${task.title} ${task.description} ${task.blocker || ""}`.toLowerCase();

      for (const [skillName, config] of Object.entries(SKILL_KEYWORDS)) {
        if (installedSkillNames.has(skillName)) continue;

        for (const keyword of config.keywords) {
          if (text.includes(keyword)) {
            const existing = skillMatches.get(skillName) || { taskIds: [], blockedCount: 0 };
            if (!existing.taskIds.includes(task.id)) {
              existing.taskIds.push(task.id);
              if (task.status === "blocked") existing.blockedCount++;
            }
            skillMatches.set(skillName, existing);
            break;
          }
        }
      }
    }

    // ── 2b. Blocker-based gap detection ─────────────────
    const blockedTasks = agentTasks.filter((t: any) => t.status === "blocked");
    for (const blockedTask of blockedTasks) {
      const blocker = (blockedTask.blocker || "").toLowerCase();

      // Map blocker text to skill categories
      const blockerSkillMap: Record<string, string> = {
        "no tool": "github",
        "don't know how": "github",
        "missing capability": "github",
        "no access": "github",
        "waiting on approval": "approval",
        "needs review": "reporting",
        "no process": "reporting",
        "unclear scope": "reporting",
      };

      for (const [blockerPattern, suggestedSkill] of Object.entries(blockerSkillMap)) {
        if (blocker.includes(blockerPattern) && !installedSkillNames.has(suggestedSkill)) {
          const existing = skillMatches.get(suggestedSkill) || { taskIds: [], blockedCount: 0 };
          if (!existing.taskIds.includes(blockedTask.id)) {
            existing.taskIds.push(blockedTask.id);
            existing.blockedCount++;
          }
          skillMatches.set(suggestedSkill, existing);
        }
      }
    }

    // ── 3. Create skill requests for detected gaps ──────
    for (const [skillName, matchInfo] of skillMatches) {
      // Only act on gaps with 2+ evidence tasks OR 1+ blocked task
      const hasEnoughEvidence = matchInfo.taskIds.length >= 2 || matchInfo.blockedCount >= 1;
      if (!hasEnoughEvidence) continue;

      // Check if a pending request already exists for this agent+skill
      const alreadyRequested = existingRequests.some(
        (r: any) => r.agent_id === agentId && r.skill_name === skillName && r.status === "pending"
      );
      if (alreadyRequested) continue;

      // Check if capability gap already exists
      const existingGap = existingGaps.find(
        (g: any) => g.agent_id === agentId && g.missing_skill_name === skillName &&
          ["pending", "approved", "monitored"].includes(g.review_status)
      );

      const skillConfig = SKILL_KEYWORDS[skillName] || {
        category: "general",
        description: `Skill: ${skillName}`,
      };

      const urgency = matchInfo.blockedCount >= 2 ? "high" as const
        : matchInfo.taskIds.length >= 3 ? "medium" as const
        : "low" as const;

      // ── 3a. Create skill_request ──────────────────────
      const { data: requestData, error: requestError } = await supabase
        .from("skill_requests")
        .insert({
          agent_id: agentId,
          skill_name: skillName,
          skill_source: "clawhub",
          skill_category: skillConfig.category,
          skill_description: skillConfig.description,
          reason: `${matchInfo.taskIds.length} task(s) reference '${skillName}' capability but agent doesn't have this skill${matchInfo.blockedCount > 0 ? ` (${matchInfo.blockedCount} blocked)` : ""}`,
          evidence_task_ids: matchInfo.taskIds,
          urgency,
          status: "pending",
          scan_result: "pending",
          scan_notes: "",
        })
        .select()
        .single();

      if (requestError) {
        results.errors.push(`Failed to create skill request for ${skillName} (${agent.name}): ${requestError.message}`);
        continue;
      }

      results.requestsCreated++;

      // ── 3b. Create or update capability_gap ──────────
      if (existingGap) {
        // Update existing gap with new evidence
        await supabase
          .from("capability_gaps")
          .update({
            evidence_count: (existingGap as any).evidence_count + matchInfo.taskIds.length,
            last_seen_at: new Date().toISOString(),
            urgency_level: urgency,
          })
          .eq("id", (existingGap as any).id);

        results.capabilityGapsUpdated++;
      } else {
        // Create new capability gap
        const { error: gapError } = await supabase
          .from("capability_gaps")
          .insert({
            agent_id: agentId,
            missing_skill_name: skillName,
            missing_skill_slug: skillName,
            gap_category: "missing_skill",
            confidence_level: matchInfo.blockedCount >= 2 ? "high" : matchInfo.taskIds.length >= 3 ? "medium" : "low",
            urgency_level: urgency,
            composite_score: matchInfo.blockedCount >= 2 ? 4.5 : matchInfo.taskIds.length >= 3 ? 3.5 : 2.5,
            evidence_count: matchInfo.taskIds.length,
            why_flagged: `${matchInfo.taskIds.length} tasks need '${skillName}', agent lacks it${matchInfo.blockedCount > 0 ? `, ${matchInfo.blockedCount} blocked` : ""}`,
            recommended_action: urgency === "high" ? "recommend_install" : "validate_with_architecture",
            owner_route: "architecture-systems",
            review_status: "pending",
          });

        if (gapError) {
          results.errors.push(`Failed to create capability gap for ${skillName} (${agent.name}): ${gapError.message}`);
        } else {
          results.capabilityGapsCreated++;
        }
      }

      // ── 3c. Log feed event ───────────────────────────
      await supabase.from("feed_events").insert({
        event_type: "skill_requested",
        source: "skill-gap-detector",
        summary: `Auto-detected: Agent '${agent.name}' needs '${skillName}' skill (${matchInfo.taskIds.length} tasks, ${matchInfo.blockedCount} blocked)`,
        related_agent_id: agentId,
      });

      // ── 3d. Log system_update ─────────────────────────
      await supabase.from("system_updates").insert({
        type: "skill_installed",
        title: `Skill gap detected: ${skillName} for ${agent.name}`,
        description: `Auto-detected ${matchInfo.taskIds.length} tasks referencing '${skillName}'. Skill request created.`,
        affected_entities: [agent.name, skillName],
        source_approval_id: requestData?.id || null,
        applied_at: new Date().toISOString(),
      });
    }

    results.gapsDetected += skillMatches.size;
  }

  // ── 4. Log summary feed event ─────────────────────────
  await supabase.from("feed_events").insert({
    event_type: "governance_daily_run",
    source: "skill-gap-detector",
    summary: `Skill gap scan complete: ${results.gapsDetected} gaps found, ${results.requestsCreated} requests created, ${results.capabilityGapsCreated} capability gaps created, ${results.capabilityGapsUpdated} updated`,
  });

  return NextResponse.json({
    success: true,
    ...results,
  });
}

// Also allow GET for manual triggering
export async function GET(req: NextRequest) {
  return POST(req);
}
