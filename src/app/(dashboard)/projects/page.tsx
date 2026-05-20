"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  AlertTriangle,
  Plus,
  ArrowRight,
  ChevronRight,
  AlertOctagon,
  Shield,
  BarChart3,
  CheckCircle2,
  Target,
  FolderOpen,
  Users,
  Zap,
  Clock,
} from "lucide-react";
import { getProjects, createProject } from "@/lib/data/projects";
import { getDepartments } from "@/lib/data/departments";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { calculateProjectHealth } from "@/lib/data/governance";
import { logFeedEvent } from "@/lib/data/feed-events";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { ProjectWithStats, ProjectHealthScore, Department, Agent, TaskWithAgent } from "@/types/dashboard";
import {
  calculatePortfolioStats,
  generateExecutiveSignals,
  generatePortfolioReview,
  type PortfolioStats,
  type ExecutiveSignal,
  type PortfolioReview,
} from "@/lib/data/portfolio";

const statusColors: Record<string, string> = {
  planning: "bg-transparent text-[var(--text-quiet)]",
  active: "bg-[rgba(59,130,246,0.08)] text-[var(--info)]",
  "on-hold": "bg-[rgba(245,158,11,0.08)] text-[var(--warning)]",
  completed: "bg-[rgba(16,185,129,0.08)] text-[var(--success)]",
  cancelled: "bg-transparent text-[var(--text-quiet)]",
};

const healthColors: Record<string, { color: string; bg: string }> = {
  healthy: { color: "text-[var(--success)]", bg: "bg-[rgba(16,185,129,0.08)] border-emerald-200" },
  watch: { color: "text-[var(--warning)]", bg: "bg-[rgba(245,158,11,0.08)] border-amber-200" },
  at_risk: { color: "text-[var(--warning)]", bg: "bg-[rgba(245,158,11,0.08)] border-orange-200" },
  critical: { color: "text-[var(--danger)]", bg: "bg-[rgba(239,68,68,0.08)] border-red-200" },
};

const priorityColors: Record<string, string> = {
  high: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]",
  medium: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]",
  low: "bg-transparent text-[var(--text-quiet)]",
};

const STATUSES = ["all", "planning", "active", "on-hold", "completed", "cancelled"] as const;
const PRIORITIES = ["all", "high", "medium", "low"] as const;

{/* Section 1 — Executive Snapshot */}
export default function PortfolioPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [healthScores, setHealthScores] = useState<Map<string, ProjectHealthScore>>(new Map());
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [signals, setSignals] = useState<ExecutiveSignal[]>([]);
  const [review, setReview] = useState<PortfolioReview | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newObjective, setNewObjective] = useState("");
  const [newScope, setNewScope] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  // Review
  const [runningReview, setRunningReview] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projResult, agentsResult, tasksResult, deptResult] = await Promise.all([
        getProjects(),
        getAgents(),
        getTasks(),
        getDepartments(),
      ]);

      const projs = projResult.data;
      const agts = agentsResult.data;
      const tsks = tasksResult.data;
      const depts = deptResult.data;

      const healthMap = new Map<string, ProjectHealthScore>();
      for (const p of projs) {
        healthMap.set(p.id, calculateProjectHealth(p, tsks, []));
      }

      setProjects(projs);
      setAgents(agts);
      setTasks(tsks);
      setDepartments(depts);
      setHealthScores(healthMap);
      setStats(calculatePortfolioStats(projs, healthMap));
      setSignals(generateExecutiveSignals(projs, healthMap, agts, tsks));
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
    const result = await createProject({
      title: newTitle.trim(),
      objective: newObjective.trim(),
      scope: newScope.trim(),
      department: newDept,
      priority: newPriority,
      dueDate: newDueDate || undefined,
    });
    if (result.error) setError(result.error);
    setCreateOpen(false);
    setNewTitle("");
    setNewObjective("");
    setNewScope("");
    setNewDept("");
    setNewPriority("medium");
    setNewDueDate("");
    setCreating(false);
    await load();
  }

  async function runReview() {
    setRunningReview(true);
    const r = generatePortfolioReview(projects, healthScores, signals);
    setReview(r);
    setReviewExpanded(true);
    await logFeedEvent({
      event_type: "portfolio_review_run",
      source: "Hermes Orchestrator",
      summary: `Portfolio review: ${r.topRisks.length} risks, ${r.bottlenecks.length} bottlenecks`,
    });
    setRunningReview(false);
  }

  const filtered = projects.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterDept !== "all" && p.owner_department !== filterDept) return false;
    if (filterPriority !== "all" && p.priority !== filterPriority) return false;
    return true;
  });

  if (loading) {
    return (
      <PageShell title="Portfolio" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Portfolio" description="Executive control tower — overview, execution, and insights">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)] mb-6">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          Section 1 — Executive Snapshot (always visible)
         ═══════════════════════════════════════════════════ */}
      <section className="space-y-4 mb-6">
        {stats && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {[
              { label: "Total Projects", value: stats.total, icon: FolderOpen, color: "" },
              { label: "Active", value: stats.active, icon: Zap, color: "text-[var(--info)]" },
              { label: "Healthy %", value: `${stats.avgHealth}%`, icon: CheckCircle2, color: stats.avgHealth >= 75 ? "text-[var(--success)]" : stats.avgHealth >= 50 ? "text-[var(--warning)]" : "text-[var(--danger)]" },
              { label: "Avg Progress", value: `${Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / Math.max(projects.length, 1))}%`, icon: Target, color: "text-[var(--accent)]" },
            ].map((s) => (
              <Card key={s.label} className="stat-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
                    <s.icon className="h-5 w-5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Executive Signals — inline */}
        {signals.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {signals.slice(0, 4).map((signal, i) => (
              <div
                key={i}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  signal.severity === "high"
                    ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]"
                    : signal.severity === "medium"
                    ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]"
                    : "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                }`}
              >
                <AlertOctagon className="h-3.5 w-3.5" />
                {signal.message.substring(0, 60)}{signal.message.length > 60 ? "…" : ""}
              </div>
            ))}
            {signals.length > 4 && (
              <span className="text-xs text-muted-foreground self-center">
                +{signals.length - 4} more signals
              </span>
            )}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════
          Section 2 — Operations (main work area)
         ═══════════════════════════════════════════════════ */}
      <section className="space-y-4 mb-6">
        {/* Action bar: filters + new project */}
        <div className="action-bar">
          <div className="flex items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All statuses" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.emoji} {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === "all" ? "All priorities" : p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Title *</label>
                    <input
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="Project title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Objective</label>
                    <textarea
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="What is this project trying to achieve?"
                      value={newObjective}
                      onChange={(e) => setNewObjective(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Scope</label>
                    <textarea
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="What's in scope and what's not?"
                      value={newScope}
                      onChange={(e) => setNewScope(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Department</label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={newDept}
                        onChange={(e) => setNewDept(e.target.value)}
                      >
                        <option value="">Select...</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Priority</label>
                      <select
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={newPriority}
                        onChange={(e) =>
                          setNewPriority(e.target.value as "high" | "medium" | "low")
                        }
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !newTitle.trim()}
                    className="w-full"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{" "}
                    Create Project
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Project table */}
        <Card className="stat-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 text-left font-semibold">Project</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold">Department</th>
                    <th className="px-4 py-3 text-center font-semibold">Tasks</th>
                    <th className="px-4 py-3 text-center font-semibold">Reviews</th>
                    <th className="px-4 py-3 text-center font-semibold">Health</th>
                    <th className="px-4 py-3 text-left font-semibold">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        {projects.length === 0
                          ? "No projects yet — create one to get started"
                          : "No projects match the current filters"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((project) => {
                      const h = healthScores.get(project.id);
                      return (
                        <tr
                          key={project.id}
                          className="border-b last:border-0 hover:bg-[var(--accent-soft)]/5 transition-colors cursor-pointer"
                          onClick={() => (window.location.href = `/projects/${project.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="text-[10px] mb-1">
                                {project.project_code}
                              </Badge>
                              <p className="font-medium">{project.title}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${statusColors[project.status]}`}>
                              {project.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${priorityColors[project.priority]}`}>
                              {project.priority}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {project.owner_department}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2 text-xs">
                              <span
                                className="font-medium"
                                title="Open"
                              >
                                {project.open_tasks}
                              </span>
                              <span
                                className={project.submitted_tasks > 0 ? "text-[var(--warning)] font-medium" : "text-muted-foreground"}
                                title="Submitted / In review"
                              >
                                {project.submitted_tasks}
                              </span>
                              <span
                                className={project.blocked_tasks > 0 ? "text-[var(--danger)] font-medium" : "text-muted-foreground"}
                                title="Blocked"
                              >
                                {project.blocked_tasks}
                              </span>
                              <span
                                className="text-[var(--success)] font-medium"
                                title="Approved / Done"
                              >
                                {project.completed_tasks}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-center justify-center gap-0.5 text-xs">
                              <span className="font-medium">{project.review_count}</span>
                              <span className="text-muted-foreground">
                                {project.last_review_at ? new Date(project.last_review_at).toLocaleDateString() : "none"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {h && (
                              <div className="flex items-center justify-center gap-1.5">
                                <div
                                  className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                                    h.status === "healthy"
                                      ? "bg-[rgba(16,185,129,0.12)] text-[var(--success)]"
                                      : h.status === "watch"
                                      ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]"
                                      : h.status === "at_risk"
                                      ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]"
                                      : "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]"
                                  }`}
                                >
                                  {h.score}
                                </div>
                                <span
                                  className={`text-xs capitalize ${healthColors[h.status]?.color ?? ""}`}
                                >
                                  {h.status.replace("_", " ")}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden min-w-16">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    project.progress >= 75
                                      ? "dot-green"
                                      : project.progress >= 50
                                      ? "dot-blue"
                                      : project.progress >= 25
                                      ? "dot-amber"
                                      : "dot-red"
                                  }`}
                                  style={{ width: `${project.progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right">
                                {project.progress}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ═══════════════════════════════════════════════════
          Section 3 — Portfolio Review (collapsible)
         ═══════════════════════════════════════════════════ */}
      <section>
        {review ? (
          <div
            className={`border rounded-lg overflow-hidden transition-all ${
              reviewExpanded ? "" : "max-h-12 cursor-pointer"
            }`}
            onClick={() => !reviewExpanded && setReviewExpanded(true)}
          >
            <div
              className="flex items-center justify-between px-4 py-3 bg-[var(--accent-soft)]/40 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setReviewExpanded((prev) => !prev);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
                  <Shield className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <h2 className="text-sm font-semibold">Portfolio Review</h2>
                <Badge className="bg-[rgba(139,92,246,0.12)] text-[var(--accent)] text-xs">
                  {review.topRisks.length} risk{review.topRisks.length !== 1 ? "s" : ""} ·{" "}
                  {review.bottlenecks.length} bottleneck{review.bottlenecks.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" className="p-0 h-auto" onClick={(e) => { e.stopPropagation(); setReviewExpanded((p) => !p); }}>
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${reviewExpanded ? "rotate-90" : ""}`}
                />
              </Button>
            </div>
            {reviewExpanded && (
              <div className="p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="stat-card">
                    <CardContent className="p-5 space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]">
                        Top Risks
                      </p>
                      {review.topRisks.length > 0 ? (
                        review.topRisks.map((r, i) => (
                          <p
                            key={i}
                            className="text-sm text-muted-foreground flex items-start gap-1.5"
                          >
                            <AlertTriangle className="h-3 w-3 text-[var(--danger)] mt-0.5 shrink-0" />{" "}
                            {r}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No risks detected</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="stat-card">
                    <CardContent className="p-5 space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--info)]">
                        Recommended Actions
                      </p>
                      {review.recommendedActions.map((a, i) => (
                        <p
                          key={i}
                          className="text-sm text-muted-foreground flex items-start gap-1.5"
                        >
                          <ChevronRight className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" /> {a}
                        </p>
                      ))}
                      {review.bottlenecks.length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)] mb-1">
                            Bottlenecks
                          </p>
                          {review.bottlenecks.map((b, i) => (
                            <p key={i} className="text-sm text-muted-foreground">{b}</p>
                          ))}
                        </div>
                      )}
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Most efficient:{" "}
                          <span className="font-medium text-foreground">
                            {review.mostEfficientDept}
                          </span>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 border rounded-lg">
            <Button onClick={runReview} disabled={runningReview} className="gap-1.5">
              {runningReview ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}
              Run Portfolio Review
            </Button>
          </div>
        )}
      </section>

    </PageShell>
  );
}
