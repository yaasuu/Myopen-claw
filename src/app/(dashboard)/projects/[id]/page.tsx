"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Loader2, AlertTriangle, RefreshCw, Pencil, Clock,
  CheckCircle2, FolderOpen, Sparkles, AlertOctagon, CheckCircle, Zap,
  Activity, Shield, MessageSquare, Send, PanelRightOpen, PanelRightClose,
  Bot, Target, FileCheck, Save, X, ChevronRight, Calendar,
  Flag, TrendingUp,
} from "lucide-react";
import {
  getProjectById, updateProject, applyProjectPlan,
  toggleProjectDeliverable, toggleProjectCriterion, setProjectStatusNarrative,
} from "@/lib/data/projects";
import {
  getOrCreateFile, updateFile, FILE_REGISTRY,
} from "@/lib/data/workspace-files";
import { generateProjectPlan } from "@/lib/data/planning";
import {
  calculateProjectHealth, getProjectMilestones, getProjectReviews,
  getProjectDecisions, createProjectReview, createProjectMilestone,
} from "@/lib/data/governance";
import { getAgents } from "@/lib/data/agents";
import { getSpecialistTypes } from "@/lib/data/departments";
import { getAllDeliverables, type Deliverable } from "@/lib/data/reviews";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type {
  Project, TaskWithAgent, FeedEvent, ProjectMilestone, ProjectReview,
  ProjectDecision, ProjectHealthScore, Agent,
} from "@/types/dashboard";

// ─── Helpers ──────────────────────────────────────────

type Tab = "overview" | "tasks" | "outputs" | "timeline" | "activity";

const statusColor: Record<string, string> = {
  planning:  "var(--text-quiet)",
  active:    "var(--info)",
  "on-hold": "var(--warning)",
  completed: "var(--success)",
  cancelled: "var(--text-quiet)",
};

const taskStatusColors: Record<string, { bg: string; color: string }> = {
  pending:       { bg: "transparent",                  color: "var(--text-quiet)" },
  dispatched:    { bg: "rgba(14,165,233,0.08)",        color: "#0ea5e9" },
  "in-progress": { bg: "rgba(59,130,246,0.08)",        color: "var(--info)" },
  submitted:     { bg: "rgba(245,158,11,0.08)",        color: "var(--warning)" },
  "in-review":   { bg: "rgba(139,92,246,0.08)",        color: "#8b5cf6" },
  approved:      { bg: "rgba(16,185,129,0.08)",        color: "var(--success)" },
  rework:        { bg: "rgba(249,115,22,0.08)",        color: "#f97316" },
  blocked:       { bg: "rgba(239,68,68,0.08)",         color: "var(--danger)" },
  done:          { bg: "rgba(16,185,129,0.08)",        color: "var(--success)" },
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function predictCompletion(project: Project, tasks: TaskWithAgent[]) {
  if (project.progress >= 100 || project.status === "completed") {
    return { label: "Complete", status: "done" as const, daysOffset: 0, predictedDate: null };
  }
  const fourteenDaysAgo = Date.now() - 14 * 86400000;
  const projTasks = tasks.filter((t) => t.project_id === project.id);
  const closedRecently = projTasks.filter(
    (t) => (t.status === "done" || t.status === "approved") && new Date(t.updated_at).getTime() >= fourteenDaysAgo
  ).length;
  const remaining = projTasks.filter((t) => t.status !== "done" && t.status !== "approved").length;
  if (closedRecently === 0 || remaining === 0) {
    return { label: "Unknown", status: "unknown" as const, daysOffset: 0, predictedDate: null };
  }
  const velocityPerDay = closedRecently / 14;
  const daysNeeded = Math.ceil(remaining / velocityPerDay);
  const predicted = new Date(Date.now() + daysNeeded * 86400000);
  const due = project.due_date ? new Date(project.due_date) : null;
  if (!due) return {
    label: predicted.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    status: "unknown" as const,
    daysOffset: 0,
    predictedDate: predicted,
  };
  const diffDays = Math.round((predicted.getTime() - due.getTime()) / 86400000);
  return {
    label: predicted.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    status: diffDays > 1 ? ("late" as const) : diffDays < -1 ? ("early" as const) : ("on_time" as const),
    daysOffset: diffDays,
    predictedDate: predicted,
  };
}

function HealthRing({ score, status }: { score: number; status: ProjectHealthScore["status"] }) {
  const r = 22, circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color = status === "healthy" ? "var(--success)" : status === "watch" ? "var(--warning)" : status === "at_risk" ? "var(--warning)" : "var(--danger)";
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" className="shrink-0">
      <circle cx="29" cy="29" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="5" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 29 29)"
        style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x="29" y="33" textAnchor="middle" fontSize="13" fontWeight="800" fill={color}>{score}</text>
    </svg>
  );
}

// Velocity sparkline — last 14 days, tasks closed per day
function Velocity({ tasks, project }: { tasks: TaskWithAgent[]; project: Project }) {
  const days = 14;
  const buckets = new Array(days).fill(0) as number[];
  for (const t of tasks) {
    if (t.project_id !== project.id) continue;
    if (t.status !== "done" && t.status !== "approved") continue;
    const dayIndex = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 86400000);
    if (dayIndex >= 0 && dayIndex < days) buckets[days - 1 - dayIndex]++;
  }
  const max = Math.max(...buckets, 1);
  const W = 200, H = 50;
  const bw = W / days;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {buckets.map((v, i) => {
        const h = (v / max) * (H - 4);
        return (
          <rect key={i} x={i * bw + 1} y={H - h} width={bw - 2} height={h}
            fill={v > 0 ? "var(--accent)" : "var(--surface-muted)"} rx="1.5" />
        );
      })}
    </svg>
  );
}

// ─── Sub: Checkable list ──────────────────────────────

function Checklist({
  title, items, done, onToggle, color = "var(--accent)", emoji,
}: {
  title: string;
  items: string[];
  done: string[];
  onToggle: (text: string, next: boolean) => Promise<void>;
  color?: string;
  emoji: string;
}) {
  const doneSet = new Set(done);
  const completed = items.filter((i) => doneSet.has(i)).length;
  const pct = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;
  const [busyOn, setBusyOn] = useState<string | null>(null);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{title}</span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: pct >= 75 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--text-quiet)" }}>
          {completed} of {items.length} · {pct}%
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs italic py-2" style={{ color: "var(--text-quiet)" }}>None defined</p>
      ) : (
        <>
          <div className="h-1 rounded-full overflow-hidden mb-3" style={{ background: "var(--surface-muted)" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
          </div>
          <div className="space-y-1.5">
            {items.map((item) => {
              const isDone = doneSet.has(item);
              return (
                <button
                  key={item}
                  onClick={async () => {
                    setBusyOn(item);
                    await onToggle(item, !isDone);
                    setBusyOn(null);
                  }}
                  className="w-full flex items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
                  disabled={busyOn === item}
                >
                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors" style={{
                    background: isDone ? color : "transparent",
                    border: `1.5px solid ${isDone ? color : "var(--border-strong)"}`,
                  }}>
                    {busyOn === item ? <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: isDone ? "#fff" : color }} /> : isDone && <CheckCircle2 className="h-2.5 w-2.5" style={{ color: "#fff" }} />}
                  </div>
                  <span className="text-sm leading-snug" style={{ color: isDone ? "var(--text-quiet)" : "var(--text)", textDecoration: isDone ? "line-through" : "none" }}>
                    {item}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Status narrative ─────────────────────────────────

function StatusNarrative({
  project, agents, canWrite, onSave,
}: {
  project: Project;
  agents: Agent[];
  canWrite: boolean;
  onSave: (narrative: string, by: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText]       = useState(project.status_narrative ?? "");
  const [author, setAuthor]   = useState(project.status_narrative_by ?? "Yas");
  const [saving, setSaving]   = useState(false);

  const authorAgent = agents.find((a) => a.name === project.status_narrative_by || a.short_id === project.status_narrative_by);

  return (
    <div className="rounded-xl border p-4 h-full flex flex-col" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Status Update</span>
        </div>
        {canWrite && !editing && (
          <button onClick={() => { setText(project.status_narrative ?? ""); setEditing(true); }} className="text-[11px] font-medium hover:underline" style={{ color: "var(--accent)" }}>
            {project.status_narrative ? "Edit" : "+ Add"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            className="flex-1 rounded-lg border p-2.5 text-sm resize-none"
            style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)" }}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Where are we right now? What's the next move?"
          />
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border px-2 py-1 text-xs"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            >
              <option value="Yas">Yas</option>
              {agents.map((a) => <option key={a.id} value={a.name}>{a.emoji} {a.name}</option>)}
            </select>
            <div className="ml-auto flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
                <X className="h-3 w-3" /> Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={async () => {
                setSaving(true);
                await onSave(text, author);
                setSaving(false);
                setEditing(false);
              }} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : project.status_narrative ? (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{authorAgent?.emoji ?? "👤"}</span>
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{project.status_narrative_by}</span>
            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>· {timeAgo(project.status_narrative_at ?? new Date().toISOString())}</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            &ldquo;{project.status_narrative}&rdquo;
          </p>
        </div>
      ) : (
        <p className="text-xs italic flex-1 flex items-center" style={{ color: "var(--text-quiet)" }}>
          No status update yet. The project lead should write a brief update here.
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────

export default function ProjectDetailPage() {
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject]   = useState<Project | null>(null);
  const [tasks, setTasks]       = useState<TaskWithAgent[]>([]);
  const [events, setEvents]     = useState<FeedEvent[]>([]);
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [plan, setPlan]         = useState<ReturnType<typeof generateProjectPlan> | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [health, setHealth]     = useState<ProjectHealthScore | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [reviews, setReviews]   = useState<ProjectReview[]>([]);
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [deliverableOutputs, setDeliverableOutputs] = useState<Deliverable[]>([]);

  // Tabs + sidebar
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Edit dialog
  const [editOpen, setEditOpen]       = useState(false);
  const [editStatus, setEditStatus]   = useState<string>("");
  const [editProgress, setEditProgress] = useState(0);
  const [editing, setEditing]         = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [result, agentsResult, specResult, deliverablesResult] = await Promise.all([
        getProjectById(projectId),
        getAgents(),
        getSpecialistTypes(),
        getAllDeliverables(200),
      ]);
      if (result.error) setError(result.error);
      setProject(result.data);
      setTasks(result.tasks);
      setEvents(result.events);
      setAgents(agentsResult.data);
      // Outputs for this project
      const projectDeliverables = (deliverablesResult.data ?? []).filter((d) => d.project_id === projectId);
      setDeliverableOutputs(projectDeliverables);

      if (result.data) {
        setPlan(generateProjectPlan(result.data, agentsResult.data, result.tasks, specResult.data));

        const [msResult, rvResult, dcResult] = await Promise.all([
          getProjectMilestones(projectId),
          getProjectReviews(projectId),
          getProjectDecisions(projectId),
        ]);
        setMilestones(msResult.data);
        setReviews(rvResult.data);
        setDecisions(dcResult.data);
        setHealth(calculateProjectHealth(result.data, result.tasks, msResult.data, rvResult.data));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [projectId]);
  useRealtimeMulti(["projects", "tasks", "feed_events"], loadRef);
  useEffect(() => { load(); }, [projectId]);

  // Cmd+I to toggle sidebar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        setSidebarOpen((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleEditSave() {
    if (!project) return;
    setEditing(true);
    const result = await updateProject(project.id, {
      status: editStatus as Project["status"],
      progress: editProgress,
    });
    if (result.data) { setProject(result.data); setEditOpen(false); }
    if (result.error) setError(result.error);
    setEditing(false);
  }

  async function toggleDeliverable(text: string, next: boolean) {
    if (!project) return;
    const res = await toggleProjectDeliverable(project.id, text, next);
    if (res.data) setProject(res.data);
  }

  async function toggleCriterion(text: string, next: boolean) {
    if (!project) return;
    const res = await toggleProjectCriterion(project.id, text, next);
    if (res.data) setProject(res.data);
  }

  async function saveNarrative(narrative: string, by: string) {
    if (!project) return;
    const res = await setProjectStatusNarrative(project.id, narrative, by);
    if (res.data) setProject(res.data);
  }

  // ── Loading / error states ─────────────────────────
  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
        </div>
      </PageShell>
    );
  }
  if (error && !project) {
    return (
      <PageShell>
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
            <div className="flex-1"><p className="text-sm font-medium">{error}</p></div>
            <button onClick={load} className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }
  if (!project) return null;

  // ── Derived ────────────────────────────────────────
  const prediction      = predictCompletion(project, tasks);
  const days            = daysUntil(project.due_date);
  const overdue         = days !== null && days < 0 && project.status !== "completed";
  const fifteenMinAgo   = Date.now() - 15 * 60 * 1000;
  const activeAgents    = agents.filter((a) => tasks.some((t) => t.assigned_agent_id === a.id && new Date(t.updated_at).getTime() >= fifteenMinAgo));
  const lead            = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) if (t.assigned_agent_id) counts.set(t.assigned_agent_id, (counts.get(t.assigned_agent_id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? agents.find((a) => a.id === top[0]) ?? null : null;
  }, [tasks, agents]);

  const openTasks       = tasks.filter((t) => t.status !== "done" && t.status !== "approved");
  const blockedTasks    = tasks.filter((t) => t.status === "blocked");
  const inReviewTasks   = tasks.filter((t) => t.status === "submitted" || t.status === "in-review");

  // ── Render ─────────────────────────────────────────
  return (
    <PageShell>
      {error && (
        <div className="rounded-lg border px-4 py-2 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>
          {error}
        </div>
      )}

      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/projects" className="flex items-center gap-1 hover:underline" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Projects
          </Link>
          <span style={{ color: "var(--text-quiet)" }}>/</span>
          <Badge variant="outline" className="text-[10px]">{project.project_code}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
              setEditStatus(project.status);
              setEditProgress(project.progress);
              setEditOpen(true);
            }}>
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSidebarOpen((s) => !s)} title="Toggle sidebar (⌘I)">
            {sidebarOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Title row + hero strip */}
      <div className="space-y-3">
        <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>{project.title}</h1>

        <div className="rounded-xl border p-5 flex items-center gap-5 flex-wrap" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
          {health && <HealthRing score={health.score} status={health.status} />}

          {/* Status + priority */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                    style={{ background: `${statusColor[project.status]}18`, color: statusColor[project.status] }}>
                {project.status}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                    style={{ background: project.priority === "high" ? "rgba(220,38,38,0.12)" : project.priority === "medium" ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.1)",
                             color:      project.priority === "high" ? "var(--danger)" : project.priority === "medium" ? "var(--warning)" : "var(--text-quiet)" }}>
                {project.priority}
              </span>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Health: {health?.status.replace("_", " ") ?? "—"}</p>
          </div>

          {/* Progress */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "var(--text-muted)" }}>Progress · {project.progress}%</span>
              <span style={{ color: prediction.status === "late" ? "var(--danger)" : prediction.status === "on_time" ? "var(--success)" : "var(--text-quiet)" }}>
                Predicted: {prediction.label}
                {prediction.status === "late" && ` (${prediction.daysOffset}d late)`}
                {prediction.status === "on_time" && " (on time)"}
                {prediction.status === "early" && ` (${Math.abs(prediction.daysOffset)}d early)`}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{
                width: `${project.progress}%`,
                background: project.progress >= 75 ? "var(--success)" : project.progress >= 50 ? "var(--info)" : project.progress >= 25 ? "var(--warning)" : "var(--danger)",
              }} />
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
            {lead && <span className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> {lead.emoji} {lead.name}</span>}
            {project.due_date && (
              <span className="flex items-center gap-1.5" style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}>
                <Calendar className="h-3.5 w-3.5" />
                {days !== null && (
                  days < 0 ? `${Math.abs(days)}d overdue` :
                  days === 0 ? "Due today" :
                  `Due ${new Date(project.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                )}
              </span>
            )}
            <span className="flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> {project.owner_department || "—"}</span>
          </div>
        </div>
      </div>

      {/* Escalation banner */}
      {health?.escalationNeeded && (
        <div className="rounded-xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: "rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.05)" }}>
          <AlertOctagon className="h-5 w-5 shrink-0" style={{ color: "var(--danger)" }} />
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>Escalation Required</p>
            <p className="text-xs" style={{ color: "var(--danger)" }}>{health.escalationReason}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface-muted)" }}>
        {([
          { id: "overview" as Tab,  label: "Overview", count: undefined },
          { id: "tasks" as Tab,     label: "Tasks",    count: tasks.length },
          { id: "outputs" as Tab,   label: "Outputs",  count: deliverableOutputs.length },
          { id: "timeline" as Tab,  label: "Timeline", count: milestones.length },
          { id: "activity" as Tab,  label: "Activity", count: events.length },
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
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[10px] tabular-nums" style={{ color: "var(--text-quiet)" }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content + sidebar */}
      <div className={`grid gap-4 ${sidebarOpen ? "lg:grid-cols-[1fr_300px]" : ""}`}>
        <div className="space-y-4 min-w-0">

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <>
              {/* Objective + status narrative */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="h-4 w-4" style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Objective</span>
                  </div>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-muted)" }}>
                    {project.objective || "No objective defined"}
                  </p>
                  <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-quiet)" }}>Scope</p>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>{project.scope || "Not defined"}</p>
                  </div>
                </div>
                <StatusNarrative project={project} agents={agents} canWrite={canWrite} onSave={saveNarrative} />
              </div>

              {/* Deliverables + criteria */}
              <div className="grid gap-4 md:grid-cols-2">
                <Checklist title="Deliverables" items={project.deliverables} done={project.deliverables_done}
                  onToggle={toggleDeliverable} color="var(--accent)" emoji="📦" />
                <Checklist title="Success Criteria" items={project.success_criteria} done={project.criteria_done}
                  onToggle={toggleCriterion} color="var(--success)" emoji="🎯" />
              </div>

              {/* Recent outputs */}
              <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4" style={{ color: "var(--info)" }} />
                    <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Recent Outputs</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                      {deliverableOutputs.length}
                    </span>
                  </div>
                  <button onClick={() => setTab("outputs")} className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                    View all <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {deliverableOutputs.length === 0 ? (
                  <p className="text-xs italic py-4 text-center" style={{ color: "var(--text-quiet)" }}>No outputs yet — agents will deliver evidence as tasks complete</p>
                ) : (
                  <div className="space-y-2">
                    {deliverableOutputs.slice(0, 5).map((d) => (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: "var(--surface-muted)" }}>
                        <FileCheck className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{d.task_title || d.evidence || "Untitled output"}</p>
                          {d.evidence && d.task_title && <p className="text-[10px] truncate" style={{ color: "var(--text-quiet)" }}>{d.evidence}</p>}
                        </div>
                        {d.assigned_agent_emoji && <span className="text-sm shrink-0">{d.assigned_agent_emoji}</span>}
                        <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--text-quiet)" }}>{timeAgo(d.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active tasks preview */}
              <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" style={{ color: "var(--info)" }} />
                    <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Active Tasks</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                      {openTasks.length}
                    </span>
                  </div>
                  <button onClick={() => setTab("tasks")} className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                    View all <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {openTasks.length === 0 ? (
                  <p className="text-xs italic py-4 text-center" style={{ color: "var(--text-quiet)" }}>All tasks complete or no tasks yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {openTasks.slice(0, 5).map((t) => {
                      const tc = taskStatusColors[t.status] ?? taskStatusColors.pending;
                      return (
                        <div key={t.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-[var(--surface-muted)] transition-colors">
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: tc.bg, color: tc.color }}>
                            {t.status}
                          </span>
                          <span className="text-sm flex-1 truncate" style={{ color: "var(--text)" }}>{t.title}</span>
                          {t.assigned_agent_emoji && <span className="text-sm shrink-0">{t.assigned_agent_emoji}</span>}
                          {t.blocker && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--danger)" }} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Execution Plan (preserved from old design, compact) */}
              {plan && (
                <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" style={{ color: "#8b5cf6" }} />
                      <span className="text-sm font-bold" style={{ color: "var(--text)" }}>AI Execution Plan</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{
                        background: plan.riskLevel === "high" ? "rgba(220,38,38,0.12)" : plan.riskLevel === "medium" ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)",
                        color:      plan.riskLevel === "high" ? "var(--danger)"        : plan.riskLevel === "medium" ? "var(--warning)"         : "var(--success)",
                      }}>
                        {plan.riskLevel} risk
                      </span>
                    </div>
                    {canWrite && plan.tasks.length > 0 && tasks.length === 0 && (
                      <Button size="sm" className="h-7 text-xs gap-1.5" disabled={applyingPlan} onClick={async () => {
                        if (!project) return;
                        setApplyingPlan(true);
                        await applyProjectPlan(project.id, { department: plan.department, taskTitles: plan.tasks.map((t) => ({ title: t.title, priority: t.priority, agentId: t.suggestedAgentId })) });
                        setApplyingPlan(false);
                        await load();
                      }}>
                        {applyingPlan ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />} Apply
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-quiet)" }}>Department</p>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{plan.department}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>{plan.departmentReason}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-quiet)" }}>Capacity</p>
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{plan.capacitySignal}</p>
                    </div>
                  </div>
                  {plan.agents.length > 0 && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Recommended Agents</p>
                      <div className="flex flex-wrap gap-2">
                        {plan.agents.slice(0, 4).map((pa) => (
                          <div key={pa.agent.id} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                               style={{ background: pa.recommended ? "var(--accent-soft)" : "var(--surface-muted)", color: pa.recommended ? "var(--accent)" : "var(--text-muted)", opacity: pa.recommended ? 1 : 0.6 }}>
                            <span>{pa.agent.emoji}</span>
                            <span className="font-medium">{pa.agent.name}</span>
                            <span className="text-[10px]">· {pa.currentLoad}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── TASKS TAB ── */}
          {tab === "tasks" && (
            <div className="rounded-xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              {tasks.length === 0 ? (
                <div className="py-12 text-center text-sm" style={{ color: "var(--text-quiet)" }}>No tasks linked to this project</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wider" style={{ color: "var(--text-quiet)", borderColor: "var(--border)" }}>
                      <th className="px-4 py-3 text-left font-bold">Title</th>
                      <th className="px-4 py-3 text-left font-bold w-28">Status</th>
                      <th className="px-4 py-3 text-left font-bold w-24">Priority</th>
                      <th className="px-4 py-3 text-left font-bold w-32">Agent</th>
                      <th className="px-4 py-3 text-left font-bold w-32">Updated</th>
                      <th className="px-4 py-3 text-left font-bold">Blocker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const tc = taskStatusColors[t.status] ?? taskStatusColors.pending;
                      return (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-[var(--surface-muted)]" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-3 font-medium text-sm" style={{ color: "var(--text)" }}>{t.title}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: tc.bg, color: tc.color }}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs capitalize" style={{ color: "var(--text-muted)" }}>{t.priority}</td>
                          <td className="px-4 py-3 text-xs">
                            {t.assigned_agent_name ? <span>{t.assigned_agent_emoji} {t.assigned_agent_name}</span> : <span style={{ color: "var(--text-quiet)" }}>Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "var(--text-quiet)" }}>{timeAgo(t.updated_at)}</td>
                          <td className="px-4 py-3 text-xs">
                            {t.blocker ? <span className="flex items-center gap-1" style={{ color: "var(--danger)" }}><AlertTriangle className="h-3 w-3" /> {t.blocker}</span> : <span style={{ color: "var(--text-quiet)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── OUTPUTS TAB ── */}
          {tab === "outputs" && (
            <div className="space-y-3">
              {deliverableOutputs.length === 0 ? (
                <div className="rounded-xl border py-16 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <FileCheck className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No outputs yet</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>Outputs appear as agents complete tasks with evidence</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {deliverableOutputs.map((d) => (
                    <div key={d.id} className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                      <div className="flex items-start gap-2 mb-2">
                        <FileCheck className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--success)" }} />
                        <p className="text-sm font-semibold leading-snug flex-1" style={{ color: "var(--text)" }}>{d.task_title || "Untitled output"}</p>
                      </div>
                      {d.evidence && (
                        <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>{d.evidence}</p>
                      )}
                      {d.notes && (
                        <p className="text-[11px] italic mb-3 px-2 py-1.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>{d.notes}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] pt-3 border-t" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
                        {d.assigned_agent_emoji && (
                          <span className="flex items-center gap-1">{d.assigned_agent_emoji} {d.assigned_agent_name}</span>
                        )}
                        <span>{timeAgo(d.created_at)}</span>
                        <Badge variant="outline" className="text-[9px] ml-auto">{d.outcome}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TIMELINE TAB ── */}
          {tab === "timeline" && (
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4" style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Milestones</span>
                  </div>
                  {canWrite && (
                    <button onClick={async () => {
                      const title = prompt("Milestone title:");
                      if (title) { await createProjectMilestone({ projectId: project.id, title }); await load(); }
                    }} className="text-[11px] font-medium hover:underline" style={{ color: "var(--accent)" }}>+ Add</button>
                  )}
                </div>
                {milestones.length === 0 ? (
                  <p className="text-xs italic py-4 text-center" style={{ color: "var(--text-quiet)" }}>No milestones yet</p>
                ) : (
                  <div className="space-y-2">
                    {milestones.map((ms) => {
                      const colors: Record<string, string> = {
                        done: "var(--success)", in_progress: "var(--info)", pending: "var(--text-quiet)", missed: "var(--danger)",
                      };
                      return (
                        <div key={ms.id} className="rounded-lg border-l-4 p-3" style={{ background: "var(--surface-muted)", borderLeftColor: colors[ms.status] }}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{ms.title}</p>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${colors[ms.status]}20`, color: colors[ms.status] }}>
                              {ms.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-quiet)" }}>
                            {ms.due_date && <span>Due {new Date(ms.due_date).toLocaleDateString()}</span>}
                            {ms.owner && <span>{ms.owner}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reviews */}
              <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" style={{ color: "var(--warning)" }} />
                    <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Project Reviews</span>
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      {(["weekly", "executive", "risk"] as const).map((type) => (
                        <button key={type} onClick={async () => {
                          const summary = prompt(`${type} review summary:`);
                          if (summary) {
                            await createProjectReview({ projectId: project.id, reviewType: type, summary, blockers: blockedTasks.map((t) => t.title) });
                            await load();
                          }
                        }} className="text-[10px] font-medium capitalize hover:underline px-1.5" style={{ color: "var(--accent)" }}>
                          +{type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {reviews.length === 0 ? (
                  <p className="text-xs italic py-4 text-center" style={{ color: "var(--text-quiet)" }}>No reviews yet</p>
                ) : (
                  <div className="space-y-2">
                    {reviews.slice(0, 5).map((rv) => (
                      <div key={rv.id} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px] capitalize">{rv.review_type}</Badge>
                          <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(rv.created_at)}</span>
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{rv.summary}</p>
                        {rv.blockers.length > 0 && (
                          <p className="text-[11px] mt-1.5" style={{ color: "var(--danger)" }}>Blockers: {rv.blockers.join(", ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ACTIVITY TAB ── */}
          {tab === "activity" && (
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4" style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Recent Activity</span>
                </div>
                {events.length === 0 ? (
                  <p className="text-xs italic py-4 text-center" style={{ color: "var(--text-quiet)" }}>No recent activity</p>
                ) : (
                  <div className="space-y-2.5">
                    {events.map((event) => (
                      <div key={event.id} className="flex items-start gap-3">
                        <span className="h-1.5 w-1.5 rounded-full mt-2 shrink-0" style={{ background: "var(--accent)" }} />
                        <div className="flex-1">
                          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{event.summary}</p>
                          <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Decisions */}
              <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4" style={{ color: "#8b5cf6" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Decision Log</span>
                </div>
                {decisions.length === 0 ? (
                  <p className="text-xs italic py-4 text-center" style={{ color: "var(--text-quiet)" }}>No decisions logged</p>
                ) : (
                  <div className="space-y-2">
                    {decisions.map((dc) => (
                      <div key={dc.id} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{dc.title}</p>
                          <Badge variant="outline" className="text-[10px] capitalize">{dc.impact_level}</Badge>
                        </div>
                        <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>{dc.summary}</p>
                        <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-quiet)" }}>
                          <span>{dc.decided_by}</span>
                          <span>·</span>
                          <span>{timeAgo(dc.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        {sidebarOpen && (
          <aside className="lg:sticky lg:top-4 lg:self-start space-y-4">
            {/* Active now */}
            <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-1.5 w-1.5">
                  {activeAgents.length > 0 && <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--success)" }} />}
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: activeAgents.length > 0 ? "var(--success)" : "var(--text-quiet)" }} />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Active Now</span>
              </div>
              {activeAgents.length === 0 ? (
                <p className="text-xs italic" style={{ color: "var(--text-quiet)" }}>No agents active in last 15min</p>
              ) : (
                <div className="space-y-1.5">
                  {activeAgents.map((a) => (
                    <Link key={a.id} href={`/agents/${a.id}`}>
                      <div className="flex items-center gap-2 rounded-lg p-2 hover:bg-[var(--surface-muted)] transition-colors cursor-pointer">
                        <span className="text-base">{a.emoji}</span>
                        <span className="text-xs font-medium flex-1 truncate" style={{ color: "var(--text)" }}>{a.name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Velocity */}
            <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Velocity</span>
                <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>14 days</span>
              </div>
              <Velocity tasks={tasks} project={project} />
              <p className="text-[10px] mt-2" style={{ color: "var(--text-quiet)" }}>Tasks closed per day</p>
            </div>

            {/* Predicted completion */}
            <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-3.5 w-3.5" style={{ color: prediction.status === "late" ? "var(--danger)" : prediction.status === "on_time" ? "var(--success)" : "var(--text-quiet)" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Predicted</span>
              </div>
              <p className="text-lg font-black" style={{ color: prediction.status === "late" ? "var(--danger)" : prediction.status === "on_time" ? "var(--success)" : "var(--text)" }}>
                {prediction.label}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>
                {prediction.status === "late" && `${prediction.daysOffset}d late vs due`}
                {prediction.status === "on_time" && "On track"}
                {prediction.status === "early" && `${Math.abs(prediction.daysOffset)}d early`}
                {prediction.status === "unknown" && "Need more data"}
                {prediction.status === "done" && "Already complete"}
              </p>
            </div>

            {/* Quick stats */}
            <div className="rounded-xl border p-4 space-y-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Quick Stats</span>
              {[
                { label: "Open tasks",   val: openTasks.length,     color: "var(--text)" },
                { label: "Blocked",      val: blockedTasks.length,  color: blockedTasks.length > 0 ? "var(--danger)" : "var(--text)" },
                { label: "In review",    val: inReviewTasks.length, color: inReviewTasks.length > 0 ? "var(--warning)" : "var(--text)" },
                { label: "Outputs",      val: deliverableOutputs.length, color: "var(--text)" },
                { label: "Milestones",   val: milestones.length,    color: "var(--text)" },
              ].map(({ label, val, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span className="font-bold tabular-nums" style={{ color }}>{val}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-center" style={{ color: "var(--text-quiet)" }}>
              Press <kbd className="px-1 py-0.5 rounded font-mono text-[9px]" style={{ background: "var(--surface-muted)" }}>⌘I</kbd> to toggle
            </p>
          </aside>
        )}
      </div>

      {/* Edit dialog */}
      {canWrite && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Update Project</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</label>
                <select className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  {["planning", "active", "on-hold", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Progress: {editProgress}%</label>
                <input type="range" min="0" max="100" className="mt-1 w-full" value={editProgress} onChange={(e) => setEditProgress(Number(e.target.value))} />
              </div>
              <Button onClick={handleEditSave} disabled={editing} className="w-full">
                {editing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
