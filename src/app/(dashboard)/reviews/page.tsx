"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, AlertTriangle, CheckCircle2, XCircle, RotateCcw, Clock,
  ShieldCheck, FileCheck, Inbox, X, Save, ArrowRight, Lock,
} from "lucide-react";
import { getTasks } from "@/lib/data/tasks";
import { getTaskReviews, submitReview } from "@/lib/data/reviews";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { TaskWithAgent, TaskReview, ReviewOutcome } from "@/types/dashboard";

const outcomeColor: Record<ReviewOutcome | string, { bg: string; color: string; label: string }> = {
  approved:            { bg: "rgba(16,185,129,0.12)", color: "var(--success)", label: "Approved" },
  rejected:            { bg: "rgba(220,38,38,0.12)",  color: "var(--danger)",  label: "Rejected" },
  returned_for_rework: { bg: "rgba(245,158,11,0.12)", color: "var(--warning)", label: "Rework" },
};

export default function ReviewsPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tasks, setTasks]         = useState<TaskWithAgent[]>([]);
  const [reviews, setReviews]     = useState<Record<string, TaskReview[]>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  // Review dialog
  const [dlgOpen, setDlgOpen]     = useState(false);
  const [dlgTask, setDlgTask]     = useState<TaskWithAgent | null>(null);
  const [dlgOutcome, setDlgOutcome] = useState<ReviewOutcome>("approved");
  const [dlgNotes, setDlgNotes]   = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getTasks();
      setTasks(result.data);
      if (result.error) setError(result.error);

      const inReviewTasks = result.data.filter((t) => t.status === "in-review" || t.status === "submitted");
      const reviewResults = await Promise.all(inReviewTasks.map((t) => getTaskReviews(t.id)));
      const map: Record<string, TaskReview[]> = {};
      inReviewTasks.forEach((t, i) => { map[t.id] = reviewResults[i].data; });
      setReviews(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "task_reviews"], loadRef);
  useEffect(() => { load(); }, []);

  function openReviewDialog(task: TaskWithAgent, outcome: ReviewOutcome) {
    setDlgTask(task);
    setDlgOutcome(outcome);
    setDlgNotes("");
    setDlgOpen(true);
  }

  async function submitDialog() {
    if (!dlgTask) return;
    setProcessing(dlgTask.id);
    await submitReview(dlgTask.id, dlgOutcome, dlgNotes);
    setProcessing(null);
    setDlgOpen(false);
    setDlgTask(null);
    setDlgNotes("");
    await load();
  }

  // ── Derived ────────────────────────────────────────
  const inReview      = useMemo(() => tasks.filter((t) => t.status === "in-review" || t.status === "submitted"), [tasks]);
  const todayStr      = new Date().toISOString().slice(0, 10);
  const approvedToday = tasks.filter((t) => (t.status === "approved" || t.status === "done") && t.updated_at?.slice(0, 10) === todayStr).length;
  const reworkCount   = tasks.filter((t) => t.status === "rework").length;
  const recentlyDone  = tasks.filter((t) => t.status === "done" || t.status === "approved").sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6);

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>{error}</div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Reviews</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            CEO review surface — approve, request rework, or reject agent work
          </p>
        </div>
        {inReview.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
               style={{ borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.06)" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--warning)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--warning)" }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--warning)" }}>
              {inReview.length} awaiting you
            </span>
          </div>
        )}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Awaiting",       val: inReview.length,    sub: "review queue",      color: inReview.length > 0 ? "var(--warning)" : "var(--text-quiet)",  bg: "rgba(245,158,11,0.08)", icon: Inbox       },
          { label: "Approved Today", val: approvedToday,      sub: "shipped",           color: "var(--success)", bg: "rgba(16,185,129,0.08)", icon: CheckCircle2 },
          { label: "In Rework",      val: reworkCount,        sub: "agents iterating",  color: reworkCount > 0 ? "var(--info)" : "var(--text-quiet)",  bg: "rgba(37,99,235,0.08)", icon: RotateCcw    },
          { label: "Done",           val: recentlyDone.length, sub: "recent completions", color: "var(--accent)",  bg: "var(--accent-soft)", icon: ShieldCheck  },
        ].map((c) => {
          const Icon = c.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
          return (
            <div key={c.label} className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{c.label}</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: c.bg }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                </div>
              </div>
              <div className="text-3xl font-black tabular-nums" style={{ color: c.color }}>{c.val}</div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quiet)" }}>{c.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Awaiting Review ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="h-4 w-4" style={{ color: "var(--warning)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Awaiting Your Review</span>
          {inReview.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "var(--warning)" }}>{inReview.length}</span>
          )}
        </div>

        {inReview.length === 0 ? (
          <div className="rounded-xl border py-12 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--success)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>All clear</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>No tasks awaiting your review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inReview.map((task) => {
              const taskReviews = reviews[task.id] ?? [];
              const lastReview  = taskReviews[0];
              const greenlight  = task.requires_yas_approval;

              return (
                <div key={task.id}
                  className="rounded-xl border-l-4 border p-4"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    borderLeftColor: greenlight ? "var(--accent)" : "var(--warning)",
                    boxShadow: "var(--shadow-card)",
                  }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge className="text-[10px]" style={{
                          background: task.priority === "high" ? "rgba(220,38,38,0.12)" : task.priority === "medium" ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.1)",
                          color:      task.priority === "high" ? "var(--danger)"        : task.priority === "medium" ? "var(--warning)"         : "var(--text-quiet)",
                        }}>{task.priority}</Badge>
                        {greenlight && (
                          <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: "var(--accent)" }}>
                            <Lock className="h-3 w-3" /> Yas approval required
                          </span>
                        )}
                        <span className="text-[10px] ml-auto tabular-nums" style={{ color: "var(--text-quiet)" }}>
                          Submitted {timeAgo(task.updated_at)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{task.title}</p>
                      {task.description && (
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{task.description}</p>
                      )}
                      {task.dispatch_notes && (
                        <p className="text-[11px] italic mt-1.5 px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>
                          Evidence: {task.dispatch_notes}
                        </p>
                      )}

                      {/* Agent + last review */}
                      <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {task.assigned_agent_name && (
                          <Link href={`/agents/${task.assigned_agent_id}`} className="hover:underline">
                            {task.assigned_agent_emoji} {task.assigned_agent_name}
                          </Link>
                        )}
                        {lastReview && (
                          <span className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{
                              background: outcomeColor[lastReview.outcome]?.bg,
                              color:      outcomeColor[lastReview.outcome]?.color,
                            }}>
                              prior: {outcomeColor[lastReview.outcome]?.label}
                            </span>
                            {lastReview.notes && <span style={{ color: "var(--text-quiet)" }}>"{lastReview.notes.slice(0, 60)}{lastReview.notes.length > 60 ? "…" : ""}"</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {canWrite && (
                    <div className="flex gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                      <Button size="sm" className="gap-1.5 flex-1" disabled={processing === task.id}
                        style={{ background: "var(--success)", color: "#fff" }}
                        onClick={() => openReviewDialog(task, "approved")}>
                        {processing === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 flex-1" disabled={processing === task.id}
                        onClick={() => openReviewDialog(task, "returned_for_rework")}>
                        <RotateCcw className="h-3 w-3" /> Request Rework
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5" disabled={processing === task.id}
                        style={{ color: "var(--danger)" }}
                        onClick={() => openReviewDialog(task, "rejected")}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recently Completed ── */}
      {recentlyDone.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4" style={{ color: "var(--success)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Recently Completed</span>
          </div>
          <div className="rounded-xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            {recentlyDone.map((task, idx) => (
              <div key={task.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-muted)] transition-colors ${idx !== recentlyDone.length - 1 ? "border-b" : ""}`} style={{ borderColor: "var(--border)" }}>
                <FileCheck className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>
                    {task.assigned_agent_emoji} {task.assigned_agent_name ?? "Unassigned"} · {timeAgo(task.updated_at)}
                  </p>
                </div>
                {task.assigned_agent_id && (
                  <Link href={`/agents/${task.assigned_agent_id}`} className="text-[10px] hover:underline" style={{ color: "var(--accent)" }}>
                    Agent <ArrowRight className="h-3 w-3 inline" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Review dialog ── */}
      {dlgOpen && dlgTask && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDlgOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5"
               style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-panel)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: outcomeColor[dlgOutcome].bg }}>
                  {dlgOutcome === "approved" && <CheckCircle2 className="h-4 w-4" style={{ color: outcomeColor[dlgOutcome].color }} />}
                  {dlgOutcome === "returned_for_rework" && <RotateCcw className="h-4 w-4" style={{ color: outcomeColor[dlgOutcome].color }} />}
                  {dlgOutcome === "rejected" && <XCircle className="h-4 w-4" style={{ color: outcomeColor[dlgOutcome].color }} />}
                </div>
                <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{outcomeColor[dlgOutcome].label}</h2>
              </div>
              <button onClick={() => setDlgOpen(false)} className="rounded-lg p-1 hover:bg-[var(--surface-muted)]">
                <X className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{dlgTask.title}</p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>
                  Notes {dlgOutcome === "approved" ? "(optional)" : "*"}
                </label>
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none"
                  rows={4}
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  placeholder={
                    dlgOutcome === "approved" ? "What you liked, anything to flag for next time…" :
                    dlgOutcome === "returned_for_rework" ? "What needs to change before approval?" :
                    "Why is this being rejected?"
                  }
                  value={dlgNotes}
                  onChange={(e) => setDlgNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDlgOpen(false)}>Cancel</Button>
                <Button size="sm" className="gap-1.5"
                  disabled={(dlgOutcome !== "approved" && !dlgNotes.trim()) || processing === dlgTask.id}
                  style={{ background: outcomeColor[dlgOutcome].color, color: "#fff" }}
                  onClick={submitDialog}>
                  {processing === dlgTask.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Submit
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
