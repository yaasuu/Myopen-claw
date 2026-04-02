import { getSupabase } from "@/lib/supabase/client";
import { logFeedEvent } from "@/lib/data/feed-events";
import type {
  CapabilityAuditRun,
  CapabilityGap,
  CapabilityGapEvidence,
  GapCategory,
  ConfidenceLevel,
  UrgencyLevel,
  GapReviewStatus,
  OwnerRoute,
  EvidenceType,
  Agent,
  TaskWithAgent,
} from "@/types/dashboard";

// ── Classification Logic ─────────────────────────────

export function classifyGap(params: {
  evidenceType: EvidenceType;
  blockerText?: string;
  reviewNotes?: string;
  agentId?: string;
  taskAgentId?: string;
}): { category: GapCategory; confidence: ConfidenceLevel; ownerRoute: OwnerRoute } {
  const { evidenceType, blockerText, reviewNotes, agentId, taskAgentId } = params;
  const bt = (blockerText ?? "").toLowerCase();
  const rn = (reviewNotes ?? "").toLowerCase();

  switch (evidenceType) {
    case "blocked_task":
    case "blocked_task":
      if (bt.includes("don't know") || bt.includes("no tool") || bt.includes("not available"))
        return { category: "missing_skill", confidence: "high", ownerRoute: "architecture-systems" };
      if (bt.includes("waiting on") || bt.includes("waiting for"))
        return { category: "dependency_blocker", confidence: "high", ownerRoute: "yas-claw" };
      if (bt.includes("not clear") || bt.includes("scope") || bt.includes("vague"))
        return { category: "unclear_scope", confidence: "medium", ownerRoute: "yas-claw" };
      return { category: "missing_skill", confidence: "medium", ownerRoute: "architecture-systems" };

    case "rejected_review":
      if (rn.includes("wrong method") || rn.includes("incomplete knowledge") || rn.includes("missing data"))
        return { category: "missing_skill", confidence: "high", ownerRoute: "architecture-systems" };
      if (rn.includes("scope too broad") || rn.includes("unclear"))
        return { category: "unclear_scope", confidence: "medium", ownerRoute: "yas-claw" };
      if (rn.includes("needs approval"))
        return { category: "approval_delay", confidence: "medium", ownerRoute: "ceo" };
      return { category: "missing_process", confidence: "medium", ownerRoute: "yas-claw" };

    case "returned_for_rework":
      if (agentId && taskAgentId && agentId === taskAgentId)
        return { category: "missing_skill", confidence: "high", ownerRoute: "architecture-systems" };
      return { category: "wrong_assignment", confidence: "medium", ownerRoute: "yas-claw" };

    case "manual_workaround":
    case "tool_mention":
      return { category: "missing_skill", confidence: "high", ownerRoute: "architecture-systems" };

    case "task_keyword":
      return { category: "missing_skill", confidence: "low", ownerRoute: "data-analyst" };

    case "discussion_signal":
    case "proposal_signal":
    case "approval_signal":
      return { category: "missing_skill", confidence: "medium", ownerRoute: "data-analyst" };

    case "repeat_assignment":
    case "live_feed_event":
      return { category: "missing_skill", confidence: "high", ownerRoute: "architecture-systems" };

    default:
      return { category: "missing_skill", confidence: "low", ownerRoute: "yas-claw" };
  }
}

// ── Evidence Scoring ─────────────────────────────────

export function scoreGapEvidence(params: {
  frequency: number;
  impact: number;
  recurrence: number;
  confidence: number;
  specificity: number;
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
}): string {
  const { gapCategory, confidence, urgency, evidenceCount } = params;

  if (gapCategory !== "missing_skill") {
    switch (gapCategory) {
      case "wrong_assignment":
        return "reassign";
      case "unclear_scope":
        return "clarify_scope";
      case "dependency_blocker":
        return "resolve_dependency";
      case "missing_process":
        return "create_sop";
      case "approval_delay":
        return "escalate_to_ceo";
    }
  }

  if (urgency === "high" && evidenceCount >= 3) {
    return "recommend_install";
  }

  if (urgency === "medium" || evidenceCount >= 2) {
    return "validate_with_architecture";
  }

  return "monitor";
}

// ── CRUD: Audit Runs ─────────────────────────────────

export async function getAuditRuns(limit = 7): Promise<{ data: CapabilityAuditRun[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("capability_audit_runs")
    .select("*")
    .order("run_date", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CapabilityAuditRun[], error: null };
}

// ── CRUD: Capability Gaps ────────────────────────────

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
    agent_name: (row.agents as Record<string, unknown>)?.name ?? undefined,
    agent_emoji: (row.agents as Record<string, unknown>)?.emoji ?? undefined,
  })) as CapabilityGap[];

  return { data: gaps, error: null };
}

export async function createCapabilityGap(input: {
  auditRunId?: string;
  agentId: string;
  missingSkillSlug?: string;
  missingSkillName: string;
  gapCategory: GapCategory;
  confidenceLevel: ConfidenceLevel;
  urgencyLevel: UrgencyLevel;
  compositeScore: number;
  evidenceCount: number;
  whyFlagged: string;
  recommendedAction: string;
  ownerRoute: OwnerRoute;
}): Promise<{ data: CapabilityGap | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  // Upsert: if open gap exists for same agent+skill+category, update it
  const { data: existing } = await supabase
    .from("capability_gaps")
    .select("id, evidence_count, last_seen_at")
    .eq("agent_id", input.agentId)
    .eq("coalesce(missing_skill_slug, missing_skill_name)", input.missingSkillName)
    .eq("gap_category", input.gapCategory)
    .in("review_status", ["pending", "approved", "monitored"])
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("capability_gaps")
      .update({
        evidence_count: (existing as Record<string, unknown>).evidence_count as number + input.evidenceCount,
        last_seen_at: new Date().toISOString(),
        urgency_level: input.urgencyLevel,
        confidence_level: input.confidenceLevel,
        composite_score: input.compositeScore,
      })
      .eq("id", (existing as Record<string, unknown>).id as string)
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: updated as CapabilityGap, error: null };
  }

  const { data, error } = await supabase
    .from("capability_gaps")
    .insert({
      audit_run_id: input.auditRunId,
      agent_id: input.agentId,
      missing_skill_slug: input.missingSkillSlug,
      missing_skill_name: input.missingSkillName,
      gap_category: input.gapCategory,
      confidence_level: input.confidenceLevel,
      urgency_level: input.urgencyLevel,
      composite_score: input.compositeScore,
      evidence_count: input.evidenceCount,
      why_flagged: input.whyFlagged,
      recommended_action: input.recommendedAction,
      owner_route: input.ownerRoute,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  if (input.urgencyLevel !== "low") {
    await logFeedEvent({
      event_type: "capability_gap_detected",
      source: "capability-governance",
      summary: `[${input.urgencyLevel.toUpperCase()}] ${input.missingSkillName} — ${input.whyFlagged}`,
      related_agent_id: input.agentId,
    });
  }

  return { data: data as CapabilityGap, error: null };
}

export async function reviewCapabilityGap(
  gapId: string,
  status: GapReviewStatus,
  reviewedBy: string,
  resolutionNotes?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("capability_gaps")
    .update({
      review_status: status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      resolution_notes: resolutionNotes ?? "",
    })
    .eq("id", gapId)
    .select()
    .single();

  if (error) return { error: error.message };

  const gap = data as CapabilityGap;

  if (status === "approved" || status === "rejected" || status === "resolved") {
    const eventType = status === "approved"
      ? "skill_recommendation_approved"
      : status === "rejected"
      ? "skill_recommendation_rejected"
      : "capability_gap_resolved";

    await logFeedEvent({
      event_type: eventType,
      source: reviewedBy,
      summary: `${gap.missing_skill_name} — ${status} (${gap.why_flagged})`,
      related_agent_id: gap.agent_id,
    });
  }

  return { error: null };
}

// ── CRUD: Evidence ───────────────────────────────────

export async function getGapEvidence(gapId: string): Promise<{ data: CapabilityGapEvidence[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("capability_gap_evidence")
    .select("*")
    .eq("gap_id", gapId)
    .order("detected_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CapabilityGapEvidence[], error: null };
}

export async function addGapEvidence(input: {
  gapId: string;
  agentId: string;
  evidenceType: EvidenceType;
  sourceTable?: string;
  sourceId?: string;
  sourceLabel?: string;
  sourceExcerpt?: string;
  weight?: number;
}): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase.from("capability_gap_evidence").insert({
    gap_id: input.gapId,
    agent_id: input.agentId,
    evidence_type: input.evidenceType,
    source_table: input.sourceTable,
    source_id: input.sourceId,
    source_label: input.sourceLabel ?? "",
    source_excerpt: input.sourceExcerpt ?? "",
    weight: input.weight ?? 1.0,
  });

  return { error: error?.message ?? null };
}

// ── Mock Data ────────────────────────────────────────

function getMockGaps(): CapabilityGap[] {
  return [
    {
      id: "cg-mock-1",
      audit_run_id: null,
      agent_id: "mock-1",
      agent_name: "Export-Growth Agent",
      agent_emoji: "📦",
      missing_skill_slug: "financial-modeling",
      missing_skill_name: "Financial Modeling",
      gap_category: "missing_skill",
      confidence_level: "high",
      urgency_level: "high",
      composite_score: 4.55,
      evidence_count: 5,
      why_flagged: "Repeated blocked tasks + session fallback — 3 tasks blocked, 2 sessions improvised",
      recommended_action: "recommend_install",
      owner_route: "architecture-systems",
      review_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      resolution_notes: "",
      first_seen_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      last_seen_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "cg-mock-2",
      audit_run_id: null,
      agent_id: "mock-2",
      agent_name: "Ops-Improvement Agent",
      agent_emoji: "⚙️",
      missing_skill_slug: null,
      missing_skill_name: "Buyer Research",
      gap_category: "missing_skill",
      confidence_level: "medium",
      urgency_level: "medium",
      composite_score: 3.2,
      evidence_count: 3,
      why_flagged: "Keyword cluster + unassigned tasks — no agent handles buyer research",
      recommended_action: "validate_with_architecture",
      owner_route: "data-analyst",
      review_status: "monitored",
      reviewed_by: null,
      reviewed_at: null,
      resolution_notes: "",
      first_seen_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      last_seen_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
      updated_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
  ];
}
