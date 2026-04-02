import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type {
  CapabilityGap,
  GapEvidence,
  AuditRun,
  GapCategory,
  ConfidenceLevel,
  UrgencyLevel,
  GapReviewStatus,
  SignalType,
  Agent,
  TaskWithAgent,
} from "@/types/dashboard";

// ── Classification Logic ─────────────────────────────

export function classifyGap(params: {
  signalType: SignalType;
  blockerText?: string;
  reviewNotes?: string;
  taskStatus?: string;
  agentId?: string;
  taskAgentId?: string;
}): { category: GapCategory; confidence: ConfidenceLevel } {
  const { signalType, blockerText, reviewNotes, taskStatus, agentId, taskAgentId } = params;
  const bt = (blockerText ?? "").toLowerCase();
  const rn = (reviewNotes ?? "").toLowerCase();

  switch (signalType) {
    case "repeated_blocked_tasks":
      if (bt.includes("don't know") || bt.includes("no tool") || bt.includes("not available"))
        return { category: "missing_skill", confidence: "high" };
      if (bt.includes("waiting on") || bt.includes("waiting for"))
        return { category: "dependency_blocker", confidence: "high" };
      if (bt.includes("not clear") || bt.includes("scope") || bt.includes("vague"))
        return { category: "unclear_scope", confidence: "medium" };
      return { category: "missing_skill", confidence: "medium" };

    case "rejected_review":
      if (rn.includes("wrong method") || rn.includes("incomplete knowledge") || rn.includes("missing data"))
        return { category: "missing_skill", confidence: "high" };
      if (rn.includes("scope too broad") || rn.includes("unclear"))
        return { category: "unclear_scope", confidence: "medium" };
      if (rn.includes("needs approval"))
        return { category: "approval_delay", confidence: "medium" };
      return { category: "missing_process", confidence: "medium" };

    case "rework_cycle":
      if (agentId && taskAgentId && agentId === taskAgentId)
        return { category: "missing_skill", confidence: "high" };
      return { category: "wrong_assignment", confidence: "medium" };

    case "tool_mention_no_skill":
      return { category: "missing_skill", confidence: "high" };

    case "session_tool_failure":
    case "fallback_chain":
      return { category: "missing_skill", confidence: "high" };

    case "unassigned_pending":
      return { category: "missing_skill", confidence: "low" };

    case "user_correction":
      return { category: "missing_skill", confidence: "medium" };

    case "keyword_cluster":
      return { category: "missing_skill", confidence: "low" };

    default:
      return { category: "missing_skill", confidence: "low" };
  }
}

// ── Evidence Scoring ─────────────────────────────────

export function scoreGapEvidence(params: {
  frequency: number;     // 1-5
  impact: number;        // 1-5
  recurrence: number;    // 1-5
  confidence: number;    // 1-5
  specificity: number;   // 1-5
}): { composite: number; urgency: UrgencyLevel } {
  const { frequency, impact, recurrence, confidence, specificity } = params;
  const composite =
    frequency * 0.25 +
    impact * 0.25 +
    recurrence * 0.2 +
    confidence * 0.15 +
    specificity * 0.15;

  let urgency: UrgencyLevel;
  if (composite >= 4.0) urgency = "high";
  else if (composite >= 3.0) urgency = "medium";
  else urgency = "low";

  return { composite: Math.round(composite * 100) / 100, urgency };
}

// ── Recommended Action Logic ─────────────────────────

export function getRecommendedAction(params: {
  gapCategory: GapCategory;
  confidence: ConfidenceLevel;
  urgency: UrgencyLevel;
  evidenceCount: number;
  hasInstalledSkill: boolean;
}): string {
  const { gapCategory, confidence, urgency, evidenceCount, hasInstalledSkill } = params;

  if (gapCategory !== "missing_skill") {
    switch (gapCategory) {
      case "wrong_assignment":
        return "Reassign work to correct agent type";
      case "unclear_scope":
        return "Clarify task scope with requestor";
      case "dependency_blocker":
        return "Resolve dependency or update blocker status";
      case "missing_process":
        return "Create SOP or workflow for this process";
      case "approval_delay":
        return "Escalate to CEO for approval";
    }
  }

  if (urgency === "high" && evidenceCount >= 3) {
    return hasInstalledSkill
      ? "Skill exists but not applied — brief agent or retrain"
      : "Request skill install — strong evidence of need";
  }

  if (urgency === "medium" || evidenceCount >= 2) {
    return "Validate with Architecture-Systems Agent before recommending";
  }

  if (confidence === "low") {
    return "Monitor for another cycle — weak signal";
  }

  return "Review evidence and decide";
}

// ── CRUD Operations ──────────────────────────────────

export async function getCapabilityGaps(options?: {
  status?: GapReviewStatus;
  urgency?: UrgencyLevel;
  limit?: number;
}): Promise<{ data: CapabilityGap[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: getMockGaps(), error: null };

  let query = supabase
    .from("capability_gaps")
    .select("*, agents(name, emoji)")
    .order("last_seen_at", { ascending: false });

  if (options?.status) query = query.eq("review_status", options.status);
  if (options?.urgency) query = query.eq("urgency_level", options.urgency);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  const gaps = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    agent_name: (row.agents as Record<string, unknown>)?.name ?? null,
    agent_emoji: (row.agents as Record<string, unknown>)?.emoji ?? null,
  })) as CapabilityGap[];

  return { data: gaps, error: null };
}

export async function getGapEvidence(gapId: string): Promise<{ data: GapEvidence[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("gap_evidence")
    .select("*")
    .eq("gap_id", gapId)
    .order("detected_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as GapEvidence[], error: null };
}

export async function getAuditRuns(limit = 7): Promise<{ data: AuditRun[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("audit_runs")
    .select("*")
    .order("run_date", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as AuditRun[], error: null };
}

export async function createCapabilityGap(input: {
  agentId?: string;
  gapCategory: GapCategory;
  capabilityArea: string;
  missingSkillSlug?: string;
  missingSkillName?: string;
  confidenceLevel: ConfidenceLevel;
  urgencyLevel: UrgencyLevel;
  evidenceCount: number;
  evidenceSummary?: string;
  evidenceTaskIds?: string[];
  evidenceSessionIds?: string[];
  whyFlagged?: string;
  recommendedAction?: string;
}): Promise<{ data: CapabilityGap | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  // Check for existing gap in same area
  const { data: existing } = await supabase
    .from("capability_gaps")
    .select("id, evidence_count, last_seen_at")
    .eq("capability_area", input.capabilityArea)
    .eq("gap_category", input.gapCategory)
    .in("review_status", ["pending", "monitoring"])
    .maybeSingle();

  if (existing) {
    // Update existing gap
    const { data: updated, error } = await supabase
      .from("capability_gaps")
      .update({
        evidence_count: (existing as Record<string, unknown>).evidence_count as number + input.evidenceCount,
        last_seen_at: new Date().toISOString(),
        urgency_level: input.urgencyLevel,
        confidence_level: input.confidenceLevel,
      })
      .eq("id", (existing as Record<string, unknown>).id as string)
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: updated as CapabilityGap, error: null };
  }

  // Create new gap
  const { data, error } = await supabase
    .from("capability_gaps")
    .insert({
      agent_id: input.agentId,
      gap_category: input.gapCategory,
      capability_area: input.capabilityArea,
      missing_skill_slug: input.missingSkillSlug ?? "",
      missing_skill_name: input.missingSkillName ?? "",
      confidence_level: input.confidenceLevel,
      urgency_level: input.urgencyLevel,
      evidence_count: input.evidenceCount,
      evidence_summary: input.evidenceSummary ?? "",
      evidence_task_ids: input.evidenceTaskIds ?? [],
      evidence_session_ids: input.evidenceSessionIds ?? [],
      why_flagged: input.whyFlagged ?? "",
      recommended_action: input.recommendedAction ?? "",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Log to feed — only for medium+ urgency
  if (input.urgencyLevel !== "low") {
    await logFeedEvent({
      event_type: "capability_gap_detected",
      source: "capability-governance",
      summary: `[${input.urgencyLevel.toUpperCase()}] ${input.capabilityArea} — ${input.whyFlagged ?? "capability gap detected"}`,
      related_agent_id: input.agentId,
    });
  }

  return { data: data as CapabilityGap, error: null };
}

export async function addGapEvidence(input: {
  gapId: string;
  signalType: SignalType;
  severity: GapEvidence["severity"];
  source: GapEvidence["source"];
  sourceId?: string;
  evidenceText?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase.from("gap_evidence").insert({
    gap_id: input.gapId,
    signal_type: input.signalType,
    severity: input.severity,
    source: input.source,
    source_id: input.sourceId ?? "",
    evidence_text: input.evidenceText ?? "",
  });

  return { error: error?.message ?? null };
}

export async function reviewCapabilityGap(
  gapId: string,
  status: GapReviewStatus,
  reviewedBy: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("capability_gaps")
    .update({
      review_status: status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", gapId)
    .select()
    .single();

  if (error) return { error: error.message };

  const gap = data as CapabilityGap;

  const eventType = status === "approved"
    ? "skill_recommendation_approved"
    : status === "rejected"
    ? "skill_recommendation_rejected"
    : "capability_gap_resolved";

  if (status === "approved" || status === "rejected" || status === "resolved") {
    await logFeedEvent({
      event_type: eventType,
      source: reviewedBy,
      summary: `${gap.capability_area} — ${status} (${gap.why_flagged})`,
      related_agent_id: gap.agent_id,
    });
  }

  return { error: null };
}

export async function logAuditRun(input: {
  runDate: string;
  sessionsScanned: number;
  tasksScanned: number;
  feedEventsScanned: number;
  gapsDetected: number;
  newGaps: number;
  criticalGaps: number;
  resolvedGaps: number;
  summary: string;
  runDurationMs: number;
}): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase.from("audit_runs").insert({
    run_date: input.runDate,
    sessions_scanned: input.sessionsScanned,
    tasks_scanned: input.tasksScanned,
    feed_events_scanned: input.feedEventsScanned,
    gaps_detected: input.gapsDetected,
    new_gaps: input.newGaps,
    critical_gaps: input.criticalGaps,
    resolved_gaps: input.resolvedGaps,
    summary: input.summary,
    run_duration_ms: input.runDurationMs,
  });

  return { error: error?.message ?? null };
}

// ── Mock Data ────────────────────────────────────────

function getMockGaps(): CapabilityGap[] {
  return [
    {
      id: "cg-1",
      agent_id: "mock-1",
      agent_name: "Export-Growth Agent",
      agent_emoji: "📦",
      gap_category: "missing_skill",
      capability_area: "export pricing",
      missing_skill_slug: "financial-modeling",
      missing_skill_name: "Financial Modeling",
      confidence_level: "high",
      urgency_level: "high",
      evidence_count: 5,
      evidence_summary: "3 blocked tasks citing lack of pricing methodology. 2 sessions show fallback to basic calculation.",
      evidence_task_ids: ["t-1", "t-2", "t-3"],
      evidence_session_ids: ["s-1"],
      why_flagged: "Repeated blocked tasks + session fallback — 3 tasks blocked, 2 sessions improvised",
      recommended_action: "Request skill install — strong evidence of need",
      review_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      last_seen_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "cg-2",
      agent_id: null,
      agent_name: undefined,
      agent_emoji: undefined,
      gap_category: "missing_skill",
      capability_area: "buyer research",
      missing_skill_slug: "market-research",
      missing_skill_name: "Market Research",
      confidence_level: "medium",
      urgency_level: "medium",
      evidence_count: 3,
      evidence_summary: "2 unassigned tasks mention buyer research. 1 session attempted manual search.",
      evidence_task_ids: ["t-4", "t-5"],
      evidence_session_ids: [],
      why_flagged: "Keyword cluster + unassigned tasks — no agent can handle buyer research",
      recommended_action: "Validate with Architecture-Systems Agent before recommending",
      review_status: "monitoring",
      reviewed_by: null,
      reviewed_at: null,
      last_seen_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
    {
      id: "cg-3",
      agent_id: "mock-2",
      agent_name: "Ops-Improvement Agent",
      agent_emoji: "⚙️",
      gap_category: "missing_process",
      capability_area: "document QA",
      missing_skill_slug: "",
      missing_skill_name: "",
      confidence_level: "low",
      urgency_level: "low",
      evidence_count: 1,
      evidence_summary: "1 rejected review citing missing QA checklist",
      evidence_task_ids: [],
      evidence_session_ids: [],
      why_flagged: "Rejected review — process gap, not skill gap",
      recommended_action: "Create SOP or workflow for this process",
      review_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      last_seen_at: new Date(Date.now() - 12 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    },
  ];
}
