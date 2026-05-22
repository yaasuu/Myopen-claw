"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, XCircle, AlertOctagon, Shield, ShieldAlert, ShieldCheck,
  Clock, Sparkles, Eye, ThumbsUp, ThumbsDown, Plus, Lightbulb,
  AlertTriangle, Inbox, Target, ChevronRight,
} from "lucide-react";
import {
  getApprovals, resolveApproval, APPROVAL_LABELS,
  type Approval, type ApprovalStatus,
} from "@/lib/data/learning";
import {
  approveSkillRequest, rejectSkillRequest, createSkillRequest,
} from "@/lib/data/skills";
import { getCapabilityGaps, reviewCapabilityGap } from "@/lib/data/capability-governance";
import { getAgents } from "@/lib/data/agents";
import { getSupabase } from "@/lib/supabase/client";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { Agent, CapabilityGap, GapReviewStatus, SkillRequest, SkillScanResult } from "@/types/dashboard";

type Lane = "all" | "skills" | "gaps" | "decisions";

const scanStyles: Record<SkillScanResult, { icon: typeof Shield; color: string; bg: string; label: string }> = {
  pending:    { icon: Clock,        color: "var(--text-quiet)", bg: "var(--surface-muted)",     label: "Pending scan" },
  clean:      { icon: ShieldCheck,  color: "var(--success)",    bg: "rgba(16,185,129,0.08)",    label: "Clean" },
  suspicious: { icon: ShieldAlert,  color: "var(--warning)",    bg: "rgba(245,158,11,0.08)",    label: "Suspicious" },
  blocked:    { icon: Shield,       color: "var(--danger)",     bg: "rgba(220,38,38,0.08)",     label: "Blocked" },
};

// Fetch pending skill requests directly (the lib's getSkillRequests returns Learning's shape)
async function getPendingSkillRequests(): Promise<SkillRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skill_requests")
    .select("*, agents(name, emoji)")
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    agent_name:  (r.agents as Record<string, unknown>)?.name ?? "—",
    agent_emoji: (r.agents as Record<string, unknown>)?.emoji ?? "🤖",
  })) as SkillRequest[];
}

export default function ApprovalsPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading]     = useState(true);
  const [decisions, setDecisions] = useState<Approval[]>([]);
  const [skills, setSkills]       = useState<SkillRequest[]>([]);
  const [gaps, setGaps]           = useState<CapabilityGap[]>([]);
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [lane, setLane]           = useState<Lane>("all");
  const [processing, setProcessing] = useState<string | null>(null);

  // Request skill form (proper dialog this time, not prompt)
  const [reqOpen, setReqOpen]         = useState(false);
  const [reqAgentId, setReqAgentId]   = useState("");
  const [reqSkillName, setReqSkillName] = useState("");
  const [reqReason, setReqReason]     = useState("");

  async function load() {
    setLoading(true);
    try {
      const [decisionsRes, skillsRes, gapsRes, agentsRes] = await Promise.allSettled([
        getApprovals("pending"),
        getPendingSkillRequests(),
        getCapabilityGaps({ status: "pending" }),
        getAgents(),
      ]);
      if (decisionsRes.status === "fulfilled") setDecisions(decisionsRes.value);
      if (skillsRes.status === "fulfilled")    setSkills(skillsRes.value);
      if (gapsRes.status === "fulfilled")      setGaps(gapsRes.value.data ?? []);
      if (agentsRes.status === "fulfilled")    setAgents(agentsRes.value.data);
    } catch (err) {
      console.error("Approvals load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["skill_requests"], loadRef);
  useEffect(() => { load(); }, []);

  async function handleDecision(id: string, status: "approved" | "rejected" | "revision_requested") {
    setProcessing(id);
    const ok = await resolveApproval(id, status, "Yas");
    if (ok) setDecisions((p) => p.filter((a) => a.id !== id));
    setProcessing(null);
  }

  async function handleSkill(id: string, approve: boolean) {
    setProcessing(id);
    if (approve) await approveSkillRequest(id, "Yas");
    else         await rejectSkillRequest(id, "Yas");
    setSkills((p) => p.filter((r) => r.id !== id));
    setProcessing(null);
  }

  async function handleGap(id: string, status: GapReviewStatus) {
    setProcessing(id);
    await reviewCapabilityGap(id, status, "Yas");
    setGaps((p) => p.filter((g) => g.id !== id));
    setProcessing(null);
  }

  async function handleRequestSkill() {
    if (!reqAgentId || !reqSkillName.trim() || !reqReason.trim()) return;
    setProcessing("creating");
    await createSkillRequest({ agentId: reqAgentId, skillName: reqSkillName.trim(), reason: reqReason.trim() });
    setReqOpen(false);
    setReqAgentId(""); setReqSkillName(""); setReqReason("");
    setProcessing(null);
    await load();
  }

  // ── Derived ────────────────────────────────────────
  const totals = useMemo(() => ({
    all:       decisions.length + skills.length + gaps.length,
    skills:    skills.length,
    gaps:      gaps.length,
    decisions: decisions.length,
  }), [decisions, skills, gaps]);

  const showSkills    = lane === "all" || lane === "skills";
  const showGaps      = lane === "all" || lane === "gaps";
  const showDecisions = lane === "all" || lane === "decisions";

  if (loading && totals.all === 0) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading approval queue…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Approvals</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Skill requests · capability gaps · decisions awaiting Yas
          </p>
        </div>
        {canWrite && (
          <Button size="sm" className="gap-1.5" onClick={() => setReqOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Request Skill
          </Button>
        )}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { id: "all" as Lane,       label: "Total",     val: totals.all,       sub: "needing action", icon: Inbox,       color: "var(--accent)",  bg: "var(--accent-soft)" },
          { id: "skills" as Lane,    label: "Skills",    val: totals.skills,    sub: "agent requests", icon: Lightbulb,   color: "var(--info)",    bg: "rgba(37,99,235,0.08)" },
          { id: "gaps" as Lane,      label: "Gaps",      val: totals.gaps,      sub: "auto-detected",  icon: Target,      color: "var(--warning)", bg: "rgba(245,158,11,0.08)" },
          { id: "decisions" as Lane, label: "Decisions", val: totals.decisions, sub: "policy & hire",  icon: CheckCircle2,color: "var(--success)", bg: "rgba(16,185,129,0.08)" },
        ].map((card) => {
          const Icon = card.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
          const active = lane === card.id;
          return (
            <button
              key={card.id}
              onClick={() => setLane(card.id)}
              className="text-left rounded-xl p-5 transition-all hover:-translate-y-0.5"
              style={{
                background: active ? card.bg : "var(--surface)",
                border:     `1px solid ${active ? card.color + "40" : "var(--border)"}`,
                boxShadow:  active ? `0 0 0 2px ${card.color}40` : "var(--shadow-card)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: active ? card.color : "var(--text-quiet)" }}>
                  {card.label}
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: card.bg }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: card.color }} />
                </div>
              </div>
              <div className="text-3xl font-black tabular-nums" style={{ color: active ? card.color : "var(--text)" }}>{card.val}</div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quiet)" }}>{card.sub}</p>
            </button>
          );
        })}
      </div>

      {/* ── Empty state ── */}
      {totals.all === 0 && (
        <div className="rounded-xl border py-16 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3" style={{ color: "var(--success)" }} />
          <p className="text-base font-semibold" style={{ color: "var(--text)" }}>All caught up</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-quiet)" }}>No pending approvals, gaps, or decisions.</p>
        </div>
      )}

      {/* ── Skill requests ── */}
      {showSkills && skills.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4" style={{ color: "var(--info)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Skill Requests</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(37,99,235,0.12)", color: "var(--info)" }}>{skills.length}</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {skills.map((req) => {
              const scan = scanStyles[req.scan_result];
              const ScanIcon = scan.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
              const blocked = req.scan_result === "blocked";
              return (
                <div key={req.id} className="rounded-xl border-l-4 border p-4" style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderLeftColor: scan.color,
                  boxShadow: "var(--shadow-card)",
                }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{req.skill_name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>
                        {req.agent_emoji} {req.agent_name} · {req.skill_source}
                      </p>
                    </div>
                    <Badge className="text-[10px] shrink-0" style={{
                      background: req.urgency === "high" ? "rgba(220,38,38,0.12)" : req.urgency === "medium" ? "rgba(245,158,11,0.12)" : "rgba(37,99,235,0.12)",
                      color:      req.urgency === "high" ? "var(--danger)"        : req.urgency === "medium" ? "var(--warning)"         : "var(--info)",
                    }}>{req.urgency}</Badge>
                  </div>

                  <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>{req.reason}</p>

                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3" style={{ background: scan.bg }}>
                    <ScanIcon className="h-4 w-4 shrink-0" style={{ color: scan.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: scan.color }}>{scan.label}</p>
                      {req.scan_notes && <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{req.scan_notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
                      Requested {timeAgo(req.requested_at)}
                    </span>
                    {canWrite && !blocked && (
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 text-xs gap-1" disabled={processing === req.id}
                          style={{ background: "var(--success)", color: "#fff" }}
                          onClick={() => handleSkill(req.id, true)}>
                          {processing === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={processing === req.id}
                          onClick={() => handleSkill(req.id, false)}>
                          <XCircle className="h-3 w-3" /> Reject
                        </Button>
                      </div>
                    )}
                    {blocked && (
                      <span className="text-[10px] font-semibold" style={{ color: "var(--danger)" }}>⛔ Auto-blocked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Capability gaps ── */}
      {showGaps && gaps.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4" style={{ color: "var(--warning)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Capability Gaps</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "var(--warning)" }}>{gaps.length}</span>
            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>· detected by nightly audit</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {gaps.map((gap) => {
              const urgencyColor: Record<string, string> = {
                high:   "var(--danger)",
                medium: "var(--warning)",
                low:    "var(--info)",
              };
              const c = urgencyColor[gap.urgency_level] ?? urgencyColor.medium;
              return (
                <div key={gap.id} className="rounded-xl border-l-4 border p-4" style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderLeftColor: c,
                  boxShadow: "var(--shadow-card)",
                }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {gap.missing_skill_name || gap.missing_skill_slug || "Unnamed capability"}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>
                        {gap.agent_emoji && <>{gap.agent_emoji} {gap.agent_name} · </>}
                        {gap.gap_category?.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge className="text-[10px] shrink-0" style={{ background: `${c}20`, color: c }}>{gap.urgency_level}</Badge>
                  </div>

                  <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>{gap.why_flagged}</p>

                  {gap.recommended_action && (
                    <div className="rounded-lg p-2.5 mb-3 flex items-start gap-2" style={{ background: "var(--accent-soft)" }}>
                      <Sparkles className="h-3 w-3 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                      <p className="text-[11px]" style={{ color: "var(--text)" }}>{gap.recommended_action}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-quiet)" }}>
                    <span>{gap.evidence_count ?? 0} evidence{(gap.evidence_count ?? 0) !== 1 ? "s" : ""}</span>
                    {canWrite && (
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-[10px] gap-1" disabled={processing === gap.id}
                          onClick={() => handleGap(gap.id, "approved")}>
                          {processing === gap.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" disabled={processing === gap.id}
                          onClick={() => handleGap(gap.id, "rejected")}>
                          <ThumbsDown className="h-3 w-3" /> Reject
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" disabled={processing === gap.id}
                          onClick={() => handleGap(gap.id, "monitored")}>
                          <Eye className="h-3 w-3" /> Monitor
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Decisions ── */}
      {showDecisions && decisions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Decision Queue</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(16,185,129,0.12)", color: "var(--success)" }}>{decisions.length}</span>
          </div>
          <div className="space-y-2">
            {decisions.map((a) => (
              <div key={a.id} className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">{APPROVAL_LABELS[a.approval_type]}</Badge>
                      <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>· by {a.requested_by} · {timeAgo(a.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{a.description}</p>
                  </div>
                </div>
                {canWrite && (
                  <div className="flex gap-1.5 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <Button size="sm" className="h-7 text-xs gap-1" disabled={processing === a.id}
                      style={{ background: "var(--success)", color: "#fff" }}
                      onClick={() => handleDecision(a.id, "approved")}>
                      {processing === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={processing === a.id}
                      onClick={() => handleDecision(a.id, "revision_requested")}>
                      <AlertTriangle className="h-3 w-3" /> Rework
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={processing === a.id}
                      style={{ color: "var(--danger)" }}
                      onClick={() => handleDecision(a.id, "rejected")}>
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Request Skill Dialog ── */}
      {reqOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setReqOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5"
               style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-panel)" }}>
            <h2 className="text-base font-bold mb-4" style={{ color: "var(--text)" }}>Request Skill</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>For agent</label>
                <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  value={reqAgentId} onChange={(e) => setReqAgentId(e.target.value)}>
                  <option value="">Select agent…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Skill name</label>
                <input className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  placeholder="e.g. PDF generation, Salesforce API"
                  value={reqSkillName} onChange={(e) => setReqSkillName(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Reason</label>
                <textarea className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none"
                  rows={3}
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  placeholder="Why does this agent need this skill?"
                  value={reqReason} onChange={(e) => setReqReason(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setReqOpen(false)}>Cancel</Button>
                <Button size="sm" disabled={!reqAgentId || !reqSkillName.trim() || !reqReason.trim() || processing === "creating"}
                  onClick={handleRequestSkill}>
                  {processing === "creating" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Submit
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="pt-2 border-t flex items-center justify-between flex-wrap gap-2" style={{ borderColor: "var(--border)" }}>
        <Link href="/learning" className="flex items-center gap-2 text-sm hover:underline" style={{ color: "var(--accent)" }}>
          <Lightbulb className="h-4 w-4" />
          Back to Learning
          <ChevronRight className="h-3 w-3" />
        </Link>
        <Link href="/skills" className="text-xs hover:underline" style={{ color: "var(--text-quiet)" }}>
          View all skills →
        </Link>
      </div>
    </PageShell>
  );
}
