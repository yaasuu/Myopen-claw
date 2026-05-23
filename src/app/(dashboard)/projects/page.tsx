"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, ArrowRight, AlertOctagon, FolderOpen, CheckCircle2,
  Target, Zap, Clock, Sparkles, LayoutGrid, List as ListIcon, GanttChartSquare,
  X, TrendingUp, AlertTriangle,
} from "lucide-react";
import { getProjects, createProject } from "@/lib/data/projects";
import { getDepartments } from "@/lib/data/departments";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { calculateProjectHealth } from "@/lib/data/governance";
import { logFeedEvent } from "@/lib/data/feed-events";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { ProjectWithStats, ProjectHealthScore, Department, Agent, TaskWithAgent } from "@/types/dashboard";
import {
  calculatePortfolioStats,
  generateExecutiveSignals,
  generatePortfolioReview,
  type ExecutiveSignal,
  type PortfolioReview,
} from "@/lib/data/portfolio";

// ─── Helpers ──────────────────────────────────────────

type View = "board" | "list" | "timeline";
type Tab  = "all" | "active" | "at_risk" | "mine";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function predictCompletion(progress: number, tasks: TaskWithAgent[], project: ProjectWithStats): {
  date: Date | null;
  label: string;
  status: "on_time" | "late" | "early" | "unknown";
  daysOffset: number;
} {
  if (progress >= 100 || project.status === "completed") {
    return { date: null, label: "Complete", status: "on_time", daysOffset: 0 };
  }
  // Velocity: tasks closed per day in last 14 days
  const fourteenDaysAgo = Date.now() - 14 * 86400000;
  const projTasks = tasks.filter((t) => t.project_id === project.id);
  const closedRecently = projTasks.filter(
    (t) => (t.status === "done" || t.status === "approved") && new Date(t.updated_at).getTime() >= fourteenDaysAgo
  ).length;
  const remaining = projTasks.filter((t) => t.status !== "done" && t.status !== "approved").length;
  if (closedRecently === 0 || remaining === 0) {
    return { date: null, label: "Unknown", status: "unknown", daysOffset: 0 };
  }
  const velocityPerDay = closedRecently / 14;
  const daysNeeded = Math.ceil(remaining / velocityPerDay);
  const predicted = new Date(Date.now() + daysNeeded * 86400000);
  const due = project.due_date ? new Date(project.due_date) : null;
  if (!due) return {
    date: predicted,
    label: predicted.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    status: "unknown",
    daysOffset: 0,
  };
  const diffDays = Math.round((predicted.getTime() - due.getTime()) / 86400000);
  return {
    date: predicted,
    label: predicted.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    status: diffDays > 1 ? "late" : diffDays < -1 ? "early" : "on_time",
    daysOffset: diffDays,
  };
}

function activeNowAgents(tasks: TaskWithAgent[], project: ProjectWithStats, agents: Agent[]): Agent[] {
  const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
  const projTasks = tasks.filter((t) => t.project_id === project.id);
  const ids = new Set(
    projTasks
      .filter((t) => t.assigned_agent_id && new Date(t.updated_at).getTime() >= fifteenMinAgo)
      .map((t) => t.assigned_agent_id as string)
  );
  return agents.filter((a) => ids.has(a.id));
}

function projectLeadAgent(project: ProjectWithStats, tasks: TaskWithAgent[], agents: Agent[]): Agent | null {
  const projTasks = tasks.filter((t) => t.project_id === project.id);
  const counts = new Map<string, number>();
  for (const t of projTasks) {
    if (!t.assigned_agent_id) continue;
    counts.set(t.assigned_agent_id, (counts.get(t.assigned_agent_id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? agents.find((a) => a.id === top[0]) ?? null : null;
}

// ─── Health ring ──────────────────────────────────────

function HealthRing({ score, status }: { score: number; status: ProjectHealthScore["status"] }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color = status === "healthy" ? "var(--success)" : status === "watch" ? "var(--warning)" : status === "at_risk" ? "var(--warning)" : "var(--danger)";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="3.5" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="3.5"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x="18" y="21" textAnchor="middle" fontSize="9" fontWeight="800" fill={color}>{score}</text>
    </svg>
  );
}

// ─── Project Card (Board view) ────────────────────────

function ProjectCard({
  project, tasks, agents, health,
}: {
  project: ProjectWithStats;
  tasks: TaskWithAgent[];
  agents: Agent[];
  health: ProjectHealthScore | undefined;
}) {
  const lead    = projectLeadAgent(project, tasks, agents);
  const active  = activeNowAgents(tasks, project, agents);
  const prediction = predictCompletion(project.progress, tasks, project);
  const days    = daysUntil(project.due_date);
  const overdue = days !== null && days < 0 && project.status !== "completed";

  const statusColor: Record<string, string> = {
    planning:  "var(--text-quiet)",
    active:    "var(--info)",
    "on-hold": "var(--warning)",
    completed: "var(--success)",
    cancelled: "var(--text-quiet)",
  };

  const predictColor =
    prediction.status === "late" ? "var(--danger)" :
    prediction.status === "on_time" ? "var(--success)" :
    prediction.status === "early" ? "var(--success)" :
    "var(--text-quiet)";

  return (
    <Link href={`/projects/${project.id}`}>
      <div
        className="group rounded-xl p-4 transition-all duration-150 hover:-translate-y-0.5 cursor-pointer h-full flex flex-col"
        style={{
          background: "var(--surface)",
          border: `1px solid ${project.blocked_tasks > 0 ? "rgba(220,38,38,0.25)" : "var(--border)"}`,
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Top: code + status */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[10px] shrink-0">{project.project_code}</Badge>
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0"
              style={{ background: `${statusColor[project.status]}18`, color: statusColor[project.status] }}
            >
              {project.status}
            </span>
          </div>
          {health && <HealthRing score={health.score} status={health.status} />}
        </div>

        {/* Title + objective */}
        <p className="text-sm font-semibold leading-snug mb-1 line-clamp-2" style={{ color: "var(--text)" }}>
          {project.title}
        </p>
        <p className="text-xs leading-snug mb-3 line-clamp-2" style={{ color: "var(--text-quiet)" }}>
          {project.objective || "No objective"}
        </p>

        {/* Lead + due */}
        <div className="flex items-center justify-between text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
          {lead ? (
            <span className="flex items-center gap-1 truncate">
              <span>{lead.emoji}</span><span className="truncate">{lead.name}</span>
            </span>
          ) : (
            <span style={{ color: "var(--text-quiet)" }}>Unassigned</span>
          )}
          {project.due_date && (
            <span className="flex items-center gap-1 shrink-0" style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}>
              <Clock className="h-3 w-3" />
              {days !== null && (
                days < 0 ? `${Math.abs(days)}d overdue` :
                days === 0 ? "Due today" :
                days <= 7 ? `in ${days}d` :
                new Date(project.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              )}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${project.progress}%`,
                background: project.progress >= 75 ? "var(--success)" : project.progress >= 50 ? "var(--info)" : project.progress >= 25 ? "var(--warning)" : "var(--danger)",
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px]">
            <span className="font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>{project.progress}%</span>
            <span style={{ color: predictColor }}>
              {prediction.status === "unknown" ? "—" : (
                prediction.status === "on_time" ? "on time" :
                prediction.status === "late" ? `${prediction.daysOffset}d late` :
                `${Math.abs(prediction.daysOffset)}d early`
              )}
              {prediction.date && ` · ${prediction.label}`}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px] mb-3" style={{ color: "var(--text-quiet)" }}>
          <span className="flex items-center gap-1">
            <span className="font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>{project.open_tasks}</span> task{project.open_tasks !== 1 ? "s" : ""}
          </span>
          {project.blocked_tasks > 0 && (
            <span className="flex items-center gap-1" style={{ color: "var(--danger)" }}>
              <AlertTriangle className="h-2.5 w-2.5" />
              <span className="font-semibold tabular-nums">{project.blocked_tasks}</span> blocked
            </span>
          )}
          {project.submitted_tasks > 0 && (
            <span className="flex items-center gap-1" style={{ color: "var(--warning)" }}>
              <span className="font-semibold tabular-nums">{project.submitted_tasks}</span> in review
            </span>
          )}
        </div>

        {/* Active now */}
        <div className="mt-auto flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          {active.length > 0 ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--success)" }}/>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--success)" }} />
              </span>
              <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>Active now:</span>
              <div className="flex items-center gap-1">
                {active.slice(0, 4).map((a) => <span key={a.id} className="text-sm" title={a.name}>{a.emoji}</span>)}
              </div>
            </>
          ) : (
            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No agents active in last 15min</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────

export default function PortfolioPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [healthScores, setHealthScores] = useState<Map<string, ProjectHealthScore>>(new Map());
  const [signals, setSignals]   = useState<ExecutiveSignal[]>([]);
  const [review, setReview]     = useState<PortfolioReview | null>(null);
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [tasks, setTasks]       = useState<TaskWithAgent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // View state
  const [view, setView] = useState<View>("board");
  const [tab, setTab]   = useState<Tab>("all");
  const [filterDept, setFilterDept] = useState("all");
  const [sortBy, setSortBy] = useState<"health" | "progress" | "due" | "name">("health");

  // Create
  const [createOpen, setCreateOpen]   = useState(false);
  const [creating, setCreating]       = useState(false);
  const [newTitle, setNewTitle]       = useState("");
  const [newObjective, setNewObjective] = useState("");
  const [newScope, setNewScope]       = useState("");
  const [newDept, setNewDept]         = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newDueDate, setNewDueDate]   = useState("");

  // Review drawer
  const [reviewOpen, setReviewOpen] = useState(false);
  const [runningReview, setRunningReview] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projRes, agentsRes, tasksRes, deptRes] = await Promise.all([
        getProjects(), getAgents(), getTasks(), getDepartments(),
      ]);
      const projs = projRes.data, agts = agentsRes.data, tsks = tasksRes.data;
      const hMap = new Map<string, ProjectHealthScore>();
      for (const p of projs) hMap.set(p.id, calculateProjectHealth(p, tsks, []));
      setProjects(projs);
      setAgents(agts);
      setTasks(tsks);
      setDepartments(deptRes.data);
      setHealthScores(hMap);
      setSignals(generateExecutiveSignals(projs, hMap, agts, tsks));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["projects", "tasks", "agents"], loadRef);
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const res = await createProject({
      title: newTitle.trim(),
      objective: newObjective.trim(),
      scope: newScope.trim(),
      department: newDept,
      priority: newPriority,
      dueDate: newDueDate || undefined,
    });
    if (res.error) setError(res.error);
    setCreateOpen(false);
    setNewTitle(""); setNewObjective(""); setNewScope("");
    setNewDept(""); setNewPriority("medium"); setNewDueDate("");
    setCreating(false);
    await load();
  }

  async function runReview() {
    setRunningReview(true);
    const r = generatePortfolioReview(projects, healthScores, signals);
    setReview(r);
    setReviewOpen(true);
    await logFeedEvent({
      event_type: "portfolio_review_run",
      source: "Hermes Orchestrator",
      summary: `Portfolio review: ${r.topRisks.length} risks, ${r.bottlenecks.length} bottlenecks`,
    });
    setRunningReview(false);
  }

  // ── Derived ────────────────────────────────────────
  const filtered = useMemo(() => {
    let out = [...projects];
    // Tab
    if (tab === "active")  out = out.filter((p) => p.status === "active");
    if (tab === "at_risk") out = out.filter((p) => {
      const h = healthScores.get(p.id);
      return h && (h.status === "at_risk" || h.status === "critical");
    });
    if (tab === "mine")    out = out.filter((p) => p.status === "active" || p.status === "planning");
    // Dept
    if (filterDept !== "all") out = out.filter((p) => p.owner_department === filterDept);
    // Sort
    out.sort((a, b) => {
      if (sortBy === "health") {
        const ha = healthScores.get(a.id)?.score ?? 0;
        const hb = healthScores.get(b.id)?.score ?? 0;
        return ha - hb; // worst first
      }
      if (sortBy === "progress") return b.progress - a.progress;
      if (sortBy === "due") {
        const ta = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const tb = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ta - tb;
      }
      return a.title.localeCompare(b.title);
    });
    return out;
  }, [projects, tab, filterDept, sortBy, healthScores]);

  // Stats
  const stats = calculatePortfolioStats(projects, healthScores);
  const onTimePct = projects.length === 0 ? 100 : Math.round(
    (projects.filter((p) => {
      if (p.status === "completed") return true;
      if (!p.due_date) return true;
      return new Date(p.due_date).getTime() > Date.now();
    }).length / projects.length) * 100
  );

  // Shipped this week
  const weekAgo = Date.now() - 7 * 86400000;
  const shippedThisWeek = projects.filter(
    (p) => p.status === "completed" && new Date(p.updated_at).getTime() >= weekAgo
  ).length;

  // ── Loading ────────────────────────────────────────
  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {error && (
        <div className="rounded-lg border px-4 py-2 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>
          {error}
        </div>
      )}

      {/* ── 1. Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Portfolio</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            {stats.total} projects · {stats.active} active · {stats.critical + projects.filter((p) => healthScores.get(p.id)?.status === "at_risk").length} at risk · {onTimePct}% on-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={runReview} disabled={runningReview}>
            {runningReview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Run AI Review
          </Button>
          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Project</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Project</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Title *</label>
                    <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Project title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Objective</label>
                    <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} placeholder="What is this project trying to achieve?" value={newObjective} onChange={(e) => setNewObjective(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Scope</label>
                    <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} placeholder="What's in scope and what's not?" value={newScope} onChange={(e) => setNewScope(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Department</label>
                      <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newDept} onChange={(e) => setNewDept(e.target.value)}>
                        <option value="">Select...</option>
                        {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Priority</label>
                      <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newPriority} onChange={(e) => setNewPriority(e.target.value as "high" | "medium" | "low")}>
                        <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                      <input type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                    </div>
                  </div>
                  <Button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="w-full">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Create Project
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ── 2. KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active",    value: stats.active,    sublabel: "in progress",    icon: Zap,         bg: "rgba(37,99,235,0.08)",   color: "var(--info)" },
          { label: "At Risk",   value: stats.critical + projects.filter((p) => healthScores.get(p.id)?.status === "at_risk").length, sublabel: "need attention", icon: AlertOctagon, bg: stats.critical > 0 ? "rgba(220,38,38,0.08)" : "var(--surface-muted)", color: stats.critical > 0 ? "var(--danger)" : "var(--text-quiet)" },
          { label: "On Time",   value: `${onTimePct}%`, sublabel: "of all projects", icon: CheckCircle2, bg: "rgba(16,185,129,0.08)",  color: "var(--success)" },
          { label: "Shipped",   value: shippedThisWeek, sublabel: "this week",      icon: TrendingUp,  bg: "var(--accent-soft)",     color: "var(--accent)" },
        ].map((card) => {
          const Icon = card.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
          return (
            <div key={card.label} className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{card.label}</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: card.bg }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: card.color }} />
                </div>
              </div>
              <div className="text-3xl font-black tabular-nums" style={{ color: card.color }}>{card.value}</div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quiet)" }}>{card.sublabel}</p>
            </div>
          );
        })}
      </div>

      {/* ── 3. Sticky signal bar ── */}
      {signals.length > 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.05)" }}>
          <AlertOctagon className="h-4 w-4 shrink-0" style={{ color: "var(--danger)" }} />
          <div className="flex-1 flex items-center gap-2 flex-wrap text-xs">
            {signals.slice(0, 3).map((s, i) => (
              <span key={i} className="font-medium" style={{ color: s.severity === "high" ? "var(--danger)" : "var(--warning)" }}>
                {i > 0 && <span className="mx-2" style={{ color: "var(--text-quiet)" }}>·</span>}
                {s.message.substring(0, 80)}{s.message.length > 80 ? "…" : ""}
              </span>
            ))}
            {signals.length > 3 && (
              <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>+{signals.length - 3} more</span>
            )}
          </div>
          <button
            onClick={runReview}
            disabled={runningReview}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--danger)", borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.1)" }}
          >
            {runningReview ? "Running…" : "Run Review →"}
          </button>
        </div>
      )}

      {/* ── 4. Tabs + sort + view ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--surface-muted)" }}>
          {([
            { id: "all" as Tab,     label: "All",     count: projects.length },
            { id: "active" as Tab,  label: "Active",  count: projects.filter((p) => p.status === "active").length },
            { id: "at_risk" as Tab, label: "At Risk", count: projects.filter((p) => { const h = healthScores.get(p.id); return h && (h.status === "at_risk" || h.status === "critical"); }).length },
            { id: "mine" as Tab,    label: "Mine",    count: projects.filter((p) => p.status === "active" || p.status === "planning").length },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all flex items-center gap-1.5"
              style={{
                background: tab === t.id ? "var(--surface)" : "transparent",
                color: tab === t.id ? "var(--text)" : "var(--text-quiet)",
                boxShadow: tab === t.id ? "var(--shadow-card)" : "none",
              }}
            >
              {t.label}
              <span className="text-[10px] tabular-nums" style={{ color: "var(--text-quiet)" }}>{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.emoji} {d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
              <SelectItem value="due">Due date</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--surface-muted)" }}>
            {([
              { id: "board" as View,   icon: LayoutGrid,        title: "Board" },
              { id: "list" as View,    icon: ListIcon,          title: "List" },
              { id: "timeline" as View, icon: GanttChartSquare, title: "Timeline" },
            ]).map((v) => {
              const Icon = v.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
                  style={{
                    background: view === v.id ? "var(--surface)" : "transparent",
                    color: view === v.id ? "var(--text)" : "var(--text-quiet)",
                    boxShadow: view === v.id ? "var(--shadow-card)" : "none",
                  }}
                  title={v.title}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 5. Main area ── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border py-16 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <FolderOpen className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No projects match these filters</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>Try changing the tab or department filter</p>
        </div>
      ) : view === "board" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} tasks={tasks} agents={agents} health={healthScores.get(p.id)} />
          ))}
        </div>
      ) : view === "list" ? (
        <ListView projects={filtered} tasks={tasks} agents={agents} healthScores={healthScores} />
      ) : (
        <TimelineView projects={filtered} healthScores={healthScores} />
      )}

      {/* ── 6. AI Review drawer ── */}
      {reviewOpen && review && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setReviewOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md p-4 overflow-y-auto" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
                  <Sparkles className="h-4 w-4" style={{ color: "var(--accent)" }} />
                </div>
                <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>AI Portfolio Review</h2>
              </div>
              <button onClick={() => setReviewOpen(false)} className="rounded-lg p-1 hover:bg-[var(--surface-muted)]">
                <X className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
              </button>
            </div>

            <p className="text-[10px] mb-4" style={{ color: "var(--text-quiet)" }}>
              Generated {timeAgo(review.timestamp)} · Hermes Orchestrator
            </p>

            {review.topRisks.length > 0 && (
              <Section title="Top Risks" icon={AlertOctagon} color="var(--danger)" items={review.topRisks} />
            )}
            {review.bottlenecks.length > 0 && (
              <Section title="Bottlenecks" icon={AlertTriangle} color="var(--warning)" items={review.bottlenecks} />
            )}
            {review.projectsNeedingIntervention.length > 0 && (
              <Section title="Need Intervention" icon={Target} color="var(--info)" items={review.projectsNeedingIntervention} />
            )}
            {review.recommendedActions.length > 0 && (
              <Section title="Recommended Actions" icon={Sparkles} color="var(--accent)" items={review.recommendedActions} />
            )}
            <div className="rounded-lg p-3 mt-4" style={{ background: "var(--surface-muted)" }}>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: "var(--text-quiet)" }}>Most Efficient Dept</p>
              <p className="text-sm font-semibold" style={{ color: "var(--success)" }}>{review.mostEfficientDept}</p>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Section({ title, icon: Icon, color, items }: { title: string; icon: React.ElementType; color: string; items: string[] }) {
  const I = Icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <I className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed pl-3 border-l" style={{ color: "var(--text-muted)", borderColor: `${color}40` }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── List view ────────────────────────────────────────

function ListView({
  projects, tasks, agents, healthScores,
}: {
  projects: ProjectWithStats[];
  tasks: TaskWithAgent[];
  agents: Agent[];
  healthScores: Map<string, ProjectHealthScore>;
}) {
  const router = useRouter();
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wider" style={{ color: "var(--text-quiet)", borderColor: "var(--border)" }}>
            <th className="px-4 py-3 text-left font-bold">Project</th>
            <th className="px-4 py-3 text-left font-bold">Status</th>
            <th className="px-4 py-3 text-left font-bold">Lead</th>
            <th className="px-4 py-3 text-left font-bold">Department</th>
            <th className="px-4 py-3 text-center font-bold">Tasks</th>
            <th className="px-4 py-3 text-center font-bold">Health</th>
            <th className="px-4 py-3 text-left font-bold">Progress</th>
            <th className="px-4 py-3 text-left font-bold">Due</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const h = healthScores.get(p.id);
            const lead = projectLeadAgent(p, tasks, agents);
            const days = daysUntil(p.due_date);
            return (
              <tr key={p.id} className="border-b last:border-0 hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => router.push(`/projects/${p.id}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{p.project_code}</Badge>
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{p.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className="text-[10px] capitalize">{p.status}</Badge>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  {lead ? `${lead.emoji} ${lead.name}` : "—"}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{p.owner_department}</td>
                <td className="px-4 py-3 text-center text-xs">
                  <span style={{ color: "var(--text)" }}>{p.open_tasks}</span>
                  {p.blocked_tasks > 0 && <span className="ml-1.5" style={{ color: "var(--danger)" }}>· {p.blocked_tasks} ⚠</span>}
                </td>
                <td className="px-4 py-3">
                  {h && <div className="flex justify-center"><HealthRing score={h.score} status={h.status} /></div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: p.progress >= 75 ? "var(--success)" : p.progress >= 50 ? "var(--info)" : "var(--warning)" }} />
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>{p.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: days !== null && days < 0 ? "var(--danger)" : "var(--text-muted)" }}>
                  {p.due_date ? (days !== null && days < 0 ? `${Math.abs(days)}d overdue` : new Date(p.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Timeline view ────────────────────────────────────

function TimelineView({ projects, healthScores }: { projects: ProjectWithStats[]; healthScores: Map<string, ProjectHealthScore> }) {
  const withDates = projects.filter((p) => p.due_date);
  if (withDates.length === 0) {
    return (
      <div className="rounded-xl border py-16 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <Clock className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No projects have due dates</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>Add due dates to see the timeline</p>
      </div>
    );
  }

  // Compute date range (today to max due date + 14 days)
  const dueDates = withDates.map((p) => new Date(p.due_date!).getTime());
  const minDate = Date.now();
  const maxDate = Math.max(...dueDates, Date.now() + 30 * 86400000) + 14 * 86400000;
  const range = maxDate - minDate;

  // Months in the range for axis ticks
  const monthLabels: { label: string; pct: number }[] = [];
  const start = new Date(minDate);
  start.setDate(1);
  for (let d = new Date(start); d.getTime() < maxDate; d.setMonth(d.getMonth() + 1)) {
    const pct = ((d.getTime() - minDate) / range) * 100;
    if (pct >= 0 && pct <= 100) {
      monthLabels.push({ label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), pct });
    }
  }

  return (
    <div className="rounded-xl border p-5 overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {/* Axis */}
      <div className="relative h-6 mb-2 ml-[180px]" style={{ borderBottom: "1px solid var(--border)" }}>
        {monthLabels.map((m) => (
          <div key={m.label} className="absolute top-0 text-[10px] font-medium" style={{ left: `${m.pct}%`, color: "var(--text-quiet)" }}>
            {m.label}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {withDates.map((p) => {
          const h = healthScores.get(p.id);
          const dueTime = new Date(p.due_date!).getTime();
          const startTime = new Date(p.created_at).getTime();
          const left  = Math.max(0, ((Math.max(startTime, minDate) - minDate) / range) * 100);
          const right = ((dueTime - minDate) / range) * 100;
          const width = Math.max(2, right - left);
          const overdue = dueTime < Date.now() && p.status !== "completed";
          const color = overdue ? "var(--danger)" : h?.status === "critical" ? "var(--danger)" : h?.status === "at_risk" || h?.status === "watch" ? "var(--warning)" : "var(--accent)";

          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <div className="flex items-center gap-2 group cursor-pointer hover:bg-[var(--surface-muted)] rounded-lg p-1.5 transition-colors">
                <div className="w-[170px] shrink-0 truncate text-xs font-medium" style={{ color: "var(--text)" }}>
                  <Badge variant="outline" className="text-[9px] mr-1">{p.project_code}</Badge>
                  {p.title}
                </div>
                <div className="relative flex-1 h-7" style={{ background: "var(--surface-muted)", borderRadius: 4 }}>
                  <div
                    className="absolute top-1 bottom-1 rounded transition-all"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: color,
                      opacity: 0.85,
                    }}
                  >
                    <div className="h-full rounded relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${p.progress}%`, background: "rgba(255,255,255,0.25)" }} />
                    </div>
                  </div>
                  <span className="absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold whitespace-nowrap" style={{ left: `calc(${right}% + 4px)`, color: overdue ? "var(--danger)" : "var(--text-muted)" }}>
                    {new Date(p.due_date!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
