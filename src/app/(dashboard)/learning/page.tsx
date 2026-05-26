"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, BookOpen, AlertTriangle, Lightbulb, Search, Calendar,
  CheckCircle2, ChevronRight, Sparkles, Zap, ArrowRight, TrendingUp,
  FolderOpen, Layers, Archive, X,
} from "lucide-react";
import {
  getDailySyncs, getLessons, getSystemUpdates, updateLessonStatus,
  type MeetingSummary, type Lesson, type SystemUpdate,
} from "@/lib/data/learning";
import {
  getDailyNotes, getKnowledgeEntries,
  type DailyNote, type KnowledgeEntry, type PARACategory,
} from "@/lib/data/knowledge";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────

const PARA_CONFIG: { key: PARACategory; label: string; sub: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: "project",  label: "Projects",  sub: "in flight",  icon: FolderOpen, color: "var(--info)",       bg: "rgba(37,99,235,0.08)"  },
  { key: "area",     label: "Areas",     sub: "ongoing",    icon: Layers,     color: "var(--accent)",     bg: "var(--accent-soft)"    },
  { key: "resource", label: "Resources", sub: "reference",  icon: BookOpen,   color: "var(--success)",    bg: "rgba(16,185,129,0.08)" },
  { key: "archive",  label: "Archives",  sub: "stored",     icon: Archive,    color: "var(--text-quiet)", bg: "var(--surface-muted)"  },
];

const LESSON_STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  draft:    { bg: "rgba(148,163,184,0.12)", color: "var(--text-quiet)" },
  pending:  { bg: "rgba(245,158,11,0.12)",  color: "var(--warning)" },
  approved: { bg: "rgba(37,99,235,0.12)",   color: "var(--info)" },
  applied:  { bg: "rgba(16,185,129,0.12)",  color: "var(--success)" },
  rejected: { bg: "rgba(148,163,184,0.12)", color: "var(--text-quiet)" },
};

// ─── Today card ───────────────────────────────────────

function TodayCard({ note, meeting }: { note: DailyNote | null; meeting: MeetingSummary | null }) {
  // Prefer DailyNote (newer source), fall back to MeetingSummary
  if (!note && !meeting) {
    return (
      <div className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Today</span>
        </div>
        <p className="text-xs italic" style={{ color: "var(--text-quiet)" }}>
          No daily sync recorded yet. The nightly summary runs at 23:00 UTC.
        </p>
      </div>
    );
  }

  const date     = note?.date ?? meeting?.date ?? "Today";
  const summary  = note?.summary ?? meeting?.summary ?? "";
  const wins     = note?.wins ?? meeting?.wins ?? [];
  const blockers = note?.blockers ?? meeting?.difficulties ?? [];
  const priorities = note?.priorities_tomorrow ?? meeting?.assigned_actions ?? [];
  const decisions = note?.decisions ?? note?.yas_decisions ?? [];
  const eventsReviewed = note?.events_reviewed ?? meeting?.event_count ?? 0;

  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
            <Calendar className="h-4 w-4" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Daily Sync — {date}</p>
            <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{eventsReviewed} events reviewed</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">Latest</Badge>
      </div>

      {summary && (
        <div className="rounded-lg p-3 mb-4" style={{ background: "var(--surface-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-quiet)" }}>Executive summary</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{summary}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Wins */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--success)" }}>
            <CheckCircle2 className="h-3 w-3" /> Wins ({wins.length})
          </p>
          {wins.length === 0 ? (
            <p className="text-[11px] italic" style={{ color: "var(--text-quiet)" }}>—</p>
          ) : (
            <ul className="space-y-1.5">
              {wins.slice(0, 4).map((w, i) => (
                <li key={i} className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{w}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Blockers */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--danger)" }}>
            <AlertTriangle className="h-3 w-3" /> Blockers ({blockers.length})
          </p>
          {blockers.length === 0 ? (
            <p className="text-[11px] italic" style={{ color: "var(--text-quiet)" }}>None</p>
          ) : (
            <ul className="space-y-1.5">
              {blockers.slice(0, 4).map((b, i) => (
                <li key={i} className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{b}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Priorities tomorrow */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
            <ChevronRight className="h-3 w-3" /> Tomorrow ({priorities.length})
          </p>
          {priorities.length === 0 ? (
            <p className="text-[11px] italic" style={{ color: "var(--text-quiet)" }}>—</p>
          ) : (
            <ul className="space-y-1.5">
              {priorities.slice(0, 4).map((p, i) => (
                <li key={i} className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {decisions.length > 0 && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Decisions</p>
          <div className="flex flex-wrap gap-1.5">
            {decisions.slice(0, 5).map((d, i) => (
              <span key={i} className="text-[11px] px-2 py-1 rounded-md" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recurring patterns panel ─────────────────────────

function RecurringPatterns({ lessons }: { lessons: Lesson[] }) {
  const patterns = useMemo(() => {
    const counts = new Map<string, { count: number; agents: Set<string>; statuses: Set<string> }>();
    for (const l of lessons) {
      const key = (l.pattern || "").trim() || "Uncategorized";
      const e = counts.get(key) ?? { count: 0, agents: new Set(), statuses: new Set() };
      e.count++;
      for (const a of l.affected_agents ?? []) e.agents.add(a);
      e.statuses.add(l.status);
      counts.set(key, e);
    }
    return [...counts.entries()]
      .map(([pattern, e]) => ({ pattern, count: e.count, agents: [...e.agents], statuses: [...e.statuses] }))
      .filter((p) => p.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [lessons]);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--warning)" }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Recurring Patterns</span>
      </div>
      {patterns.length === 0 ? (
        <p className="text-xs italic" style={{ color: "var(--text-quiet)" }}>No recurring patterns yet. Patterns appear when a theme is detected in 2+ lessons.</p>
      ) : (
        <div className="space-y-2.5">
          {patterns.map((p, i) => (
            <div key={i} className="rounded-lg p-2.5" style={{ background: "var(--surface-muted)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{p.pattern}</span>
                <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.12)", color: "var(--warning)" }}>
                  ×{p.count}
                </span>
              </div>
              {p.agents.length > 0 && (
                <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
                  Agents: {p.agents.slice(0, 3).join(", ")}{p.agents.length > 3 ? `, +${p.agents.length - 3}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────

export default function LearningPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading]     = useState(true);
  const [meetings, setMeetings]   = useState<MeetingSummary[]>([]);
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [lessons, setLessons]     = useState<Lesson[]>([]);
  const [updates, setUpdates]     = useState<SystemUpdate[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);

  // Tabs
  const [activeTab, setActiveTab]         = useState<"learning" | "knowledge">("learning");

  // Learning filters
  const [lessonFilter, setLessonFilter]   = useState<string>("all");
  const [searchQ, setSearchQ]             = useState("");
  const [scanning, setScanning]           = useState(false);
  const [scanMsg, setScanMsg]             = useState("");

  // Knowledge tab local state
  const [knowledgeFilter, setKnowledgeFilter] = useState<PARACategory | "all">("all");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        getDailySyncs(7),
        getDailyNotes(14),
        getLessons(lessonFilter === "all" ? undefined : lessonFilter),
        getSystemUpdates(),
        // Load all entries for the embedded Knowledge tab (client-side filtered)
        getKnowledgeEntries(),
      ]);
      setMeetings(results[0].status === "fulfilled" ? results[0].value : []);
      setDailyNotes(results[1].status === "fulfilled" ? (results[1].value.data ?? []) : []);
      setLessons(results[2].status === "fulfilled" ? results[2].value : []);
      setUpdates(results[3].status === "fulfilled" ? results[3].value : []);
      setKnowledge(results[4].status === "fulfilled" ? (results[4].value.data ?? []) : []);
    } catch (err) {
      console.error("Learning load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [lessonFilter, searchQ]);
  useRealtimeMulti(["daily_notes", "lessons", "system_updates"], loadRef);

  useEffect(() => { load(); }, [lessonFilter, searchQ]);

  async function handleScanLessons() {
    setScanning(true);
    setScanMsg("Scanning tasks and reviews for patterns…");
    try {
      const resp = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_and_draft_lessons" }),
      });
      const result = await resp.json();
      setScanMsg(result.lessons_draft > 0
        ? `✅ ${result.lessons_draft} new lesson(s) drafted.`
        : "✅ No new recurring patterns found.");
      await load();
    } catch (e: unknown) {
      setScanMsg(`❌ Scan failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
    setScanning(false);
    setTimeout(() => setScanMsg(""), 6000);
  }

  async function handleLessonStatus(id: string, status: Lesson["status"]) {
    const ok = await updateLessonStatus(id, status);
    if (ok) load();
  }

  // ── Derived ────────────────────────────────────────
  const todayNote     = dailyNotes[0] ?? null;
  const todayMeeting  = meetings[0] ?? null;

  const filteredLessons = useMemo(() => {
    let out = [...lessons];
    if (searchQ) {
      const q = searchQ.toLowerCase();
      out = out.filter((l) =>
        l.title?.toLowerCase().includes(q) ||
        l.lesson_statement?.toLowerCase().includes(q) ||
        l.proposed_fix?.toLowerCase().includes(q)
      );
    }
    return out.sort((a, b) => new Date(b.date_detected).getTime() - new Date(a.date_detected).getTime());
  }, [lessons, searchQ]);

  // Knowledge tab derived state (client-side filtered)
  const knowledgeFiltered = useMemo(() => {
    let out = [...knowledge];
    if (knowledgeSearch) {
      const q = knowledgeSearch.toLowerCase();
      out = out.filter((e) =>
        e.title?.toLowerCase().includes(q) ||
        e.content?.toLowerCase().includes(q) ||
        e.tags?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    if (knowledgeFilter !== "all") {
      out = out.filter((e) => e.category === knowledgeFilter);
    }
    return out;
  }, [knowledge, knowledgeSearch, knowledgeFilter]);

  const knowledgeTotalByCat = useMemo(() => {
    const base = knowledge.filter((e) => {
      if (!knowledgeSearch) return true;
      const q = knowledgeSearch.toLowerCase();
      return (
        e.title?.toLowerCase().includes(q) ||
        e.content?.toLowerCase().includes(q) ||
        e.tags?.some((t: string) => t.toLowerCase().includes(q))
      );
    });
    const r: Record<PARACategory, number> = { project: 0, area: 0, resource: 0, archive: 0 };
    for (const e of base) r[e.category] = (r[e.category] ?? 0) + 1;
    return r;
  }, [knowledge, knowledgeSearch]);

  if (loading && lessons.length === 0 && dailyNotes.length === 0) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading learning hub…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Header + stat strip ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Learning</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            What the org has learned · daily sync, lessons, knowledge base
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[
            { label: "lessons",   val: lessons.length,    color: "var(--warning)" },
            { label: "knowledge", val: knowledge.length,  color: "var(--info)" },
            { label: "updates",   val: updates.length,    color: "var(--success)" },
          ].map(({ label, val, color }) => (
            <div key={label} className="hidden md:flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="text-sm font-black tabular-nums" style={{ color }}>{val}</span>
              <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-quiet)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1.5">
        {(["learning", "knowledge"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors"
            style={{
              background: activeTab === tab ? "var(--text)" : "transparent",
              color:      activeTab === tab ? "var(--surface)" : "var(--text-muted)",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "learning" && <>
      {/* ── Hero search ── */}
      <div className="rounded-xl border flex items-center gap-3 px-4 py-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-quiet)" }} />
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-quiet)]"
          placeholder="Search lessons, knowledge, daily syncs…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        {searchQ && (
          <button onClick={() => setSearchQ("")} className="text-[11px] hover:underline" style={{ color: "var(--text-quiet)" }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Today + recurring patterns ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <TodayCard note={todayNote} meeting={todayMeeting} />
        <RecurringPatterns lessons={lessons} />
      </div>

      {/* ── Lessons timeline ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(245,158,11,0.08)" }}>
              <Lightbulb className="h-4 w-4" style={{ color: "var(--warning)" }} />
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Lessons</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
              {filteredLessons.length}
            </span>
          </div>
          {canWrite && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleScanLessons} disabled={scanning}>
              {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Scan now
            </Button>
          )}
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {["all", "draft", "pending", "approved", "applied"].map((f) => (
            <button
              key={f}
              onClick={() => setLessonFilter(f)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-colors"
              style={{
                background: lessonFilter === f ? "var(--text)" : "var(--surface-muted)",
                color:      lessonFilter === f ? "var(--surface)" : "var(--text-muted)",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {scanMsg && (
          <div className="text-xs font-mono px-3 py-2 rounded-md mb-3" style={{
            background: scanMsg.startsWith("✅") ? "rgba(16,185,129,0.08)" : scanMsg.startsWith("❌") ? "rgba(239,68,68,0.08)" : "rgba(139,92,246,0.08)",
            color:      scanMsg.startsWith("✅") ? "var(--success)"        : scanMsg.startsWith("❌") ? "var(--danger)"         : "var(--accent)",
          }}>
            {scanMsg}
          </div>
        )}

        {filteredLessons.length === 0 ? (
          <div className="rounded-xl border py-12 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <Lightbulb className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No lessons yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>Lessons are detected automatically from recurring patterns in tasks and reviews.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredLessons.map((lesson) => {
              const sc = LESSON_STATUS_COLOR[lesson.status] ?? LESSON_STATUS_COLOR.draft;
              return (
                <div key={lesson.id} className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: sc.bg, color: sc.color }}>
                          {lesson.status}
                        </span>
                        {lesson.pattern && (
                          <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>· {lesson.pattern}</span>
                        )}
                        <span className="text-[10px] ml-auto" style={{ color: "var(--text-quiet)" }}>
                          {timeAgo(lesson.date_detected)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>{lesson.title}</p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>{lesson.lesson_statement}</p>
                  {lesson.proposed_fix && (
                    <div className="rounded-lg p-2.5 mb-3" style={{ background: "var(--surface-muted)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-quiet)" }}>Proposed fix</p>
                      <p className="text-xs" style={{ color: "var(--text)" }}>{lesson.proposed_fix}</p>
                    </div>
                  )}
                  {(lesson.affected_agents?.length > 0 || canWrite) && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {lesson.affected_agents?.slice(0, 4).map((a, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                            {a}
                          </span>
                        ))}
                      </div>
                      {canWrite && (
                        <div className="flex gap-1.5">
                          {lesson.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleLessonStatus(lesson.id, "pending")}>
                              Promote
                            </Button>
                          )}
                          {lesson.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleLessonStatus(lesson.id, "approved")}>
                                ✓ Approve
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px]" style={{ color: "var(--danger)" }} onClick={() => handleLessonStatus(lesson.id, "rejected")}>
                                Reject
                              </Button>
                            </>
                          )}
                          {lesson.status === "approved" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleLessonStatus(lesson.id, "applied")}>
                              🚀 Mark applied
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Footer: quick links ── */}
      <div className="grid gap-3 sm:grid-cols-2 pt-3">
        <Link href="/approvals" className="group rounded-xl border p-4 hover:-translate-y-0.5 transition-all"
              style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
              <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} />
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Approvals</span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
            Skill requests · capability gaps · decisions
          </p>
          <div className="mt-2 text-[11px] font-medium flex items-center gap-1 group-hover:underline" style={{ color: "var(--accent)" }}>
            Open <ArrowRight className="h-3 w-3" />
          </div>
        </Link>

        <div className="rounded-xl border p-4"
             style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(16,185,129,0.08)" }}>
              <Zap className="h-4 w-4" style={{ color: "var(--success)" }} />
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Applied Updates</span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
            {updates.length} {updates.length === 1 ? "update" : "updates"} shipped
          </p>
          {updates[0] && (
            <p className="text-[11px] mt-2 truncate" style={{ color: "var(--text-muted)" }}>
              Latest: {updates[0].title}
            </p>
          )}
        </div>
      </div>
      </>}

      {activeTab === "knowledge" && <>
      {/* ── Knowledge: search ── */}
      <div className="rounded-xl border flex items-center gap-3 px-4 py-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-quiet)" }} />
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-quiet)]"
          placeholder="Search knowledge entries…"
          value={knowledgeSearch}
          onChange={(e) => setKnowledgeSearch(e.target.value)}
        />
        {knowledgeSearch && (
          <button onClick={() => setKnowledgeSearch("")} className="rounded p-1 hover:bg-[var(--surface-muted)]">
            <X className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
          </button>
        )}
      </div>

      {/* ── Knowledge: PARA cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PARA_CONFIG.map((cat) => {
          const Icon = cat.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
          const isActive = knowledgeFilter === cat.key;
          const count = knowledgeTotalByCat[cat.key];
          return (
            <button
              key={cat.key}
              onClick={() => setKnowledgeFilter(isActive ? "all" : cat.key)}
              className="rounded-xl p-5 text-left transition-all hover:-translate-y-0.5"
              style={{
                background: isActive ? cat.bg : "var(--surface)",
                border: `1px solid ${isActive ? cat.color + "40" : "var(--border)"}`,
                boxShadow: isActive ? `0 0 0 2px ${cat.color}40` : "var(--shadow-card)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isActive ? cat.color : "var(--text-quiet)" }}>
                  {cat.label}
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: cat.bg }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                </div>
              </div>
              <div className="text-3xl font-black tabular-nums" style={{ color: isActive ? cat.color : "var(--text)" }}>{count}</div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quiet)" }}>{cat.sub}</p>
            </button>
          );
        })}
      </div>

      {/* ── Knowledge: active filter chip ── */}
      {knowledgeFilter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Filtered by</span>
          <button
            onClick={() => setKnowledgeFilter("all")}
            className="rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5 capitalize"
            style={{ background: PARA_CONFIG.find((c) => c.key === knowledgeFilter)?.bg, color: PARA_CONFIG.find((c) => c.key === knowledgeFilter)?.color }}
          >
            {knowledgeFilter} <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ── Knowledge: entries grid ── */}
      {knowledgeFiltered.length === 0 ? (
        <div className="rounded-xl border py-16 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <BookOpen className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {knowledgeSearch ? "No entries match your search" : knowledgeFilter === "all" ? "No knowledge entries yet" : `No ${knowledgeFilter} entries yet`}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
            Knowledge accrues as agents document decisions, findings, and references.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {knowledgeFiltered.map((entry) => {
            const cat = PARA_CONFIG.find((c) => c.key === entry.category);
            return (
              <div key={entry.id} className="rounded-xl border p-4 transition-all hover:-translate-y-0.5" style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-card)",
              }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>{entry.title}</p>
                  <Badge variant="outline" className="text-[10px] capitalize shrink-0" style={{ color: cat?.color }}>
                    {entry.category}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed line-clamp-3 mb-3" style={{ color: "var(--text-muted)" }}>{entry.content}</p>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {entry.tags.slice(0, 5).map((tag: string) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] pt-2 border-t" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {timeAgo(entry.updated_at)}
                  </span>
                  <span>{entry.source}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Knowledge: footer count ── */}
      <div className="pt-2 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
        {knowledgeFiltered.length} of {knowledge.length} {knowledge.length !== 1 ? "entries" : "entry"}
      </div>
      </>}
    </PageShell>
  );
}
