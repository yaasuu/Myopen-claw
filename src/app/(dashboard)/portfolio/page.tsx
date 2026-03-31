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
  Loader2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  Clock,
  FolderOpen,
  AlertOctagon,
  Users,
  Zap,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { getProjects } from "@/lib/data/projects";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { getDepartments } from "@/lib/data/departments";
import { calculateProjectHealth } from "@/lib/data/governance";
import { logFeedEvent } from "@/lib/data/feed-events";
import {
  calculatePortfolioStats,
  generateExecutiveSignals,
  generatePortfolioReview,
  type PortfolioView,
  type PortfolioStats,
  type ExecutiveSignal,
  type PortfolioReview,
} from "@/lib/data/portfolio";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { ProjectWithStats, ProjectHealthScore, Department, Agent, TaskWithAgent } from "@/types/dashboard";

const statusColors: Record<string, string> = {
  planning: "bg-slate-100 text-slate-600",
  active: "bg-blue-50 text-blue-700",
  "on-hold": "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const healthColors: Record<string, { color: string; bg: string }> = {
  healthy: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  watch: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  at_risk: { color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  critical: { color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

const VIEWS: PortfolioView[] = ["status", "department", "priority", "health"];

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [healthScores, setHealthScores] = useState<Map<string, ProjectHealthScore>>(new Map());
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [signals, setSignals] = useState<ExecutiveSignal[]>([]);
  const [review, setReview] = useState<PortfolioReview | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [view, setView] = useState<PortfolioView>("status");
  const [runningReview, setRunningReview] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projResult, agentsResult, tasksResult] = await Promise.all([
        getProjects(),
        getAgents(),
        getTasks(),
      ]);

      const projs = projResult.data;
      const agts = agentsResult.data;
      const tsks = tasksResult.data;

      // Calculate health for each project
      const healthMap = new Map<string, ProjectHealthScore>();
      for (const p of projs) {
        const projTasks = tsks.filter((t) => t.assigned_agent_id);
        healthMap.set(p.id, calculateProjectHealth(p, projTasks, []));
      }

      setProjects(projs);
      setAgents(agts);
      setTasks(tsks);
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

  async function runReview() {
    setRunningReview(true);
    const r = generatePortfolioReview(projects, healthScores, signals);
    setReview(r);
    await logFeedEvent({
      event_type: "portfolio_review_run",
      source: "Yas Claw",
      summary: `Portfolio review: ${r.topRisks.length} risks, ${r.bottlenecks.length} bottlenecks`,
    });
    setRunningReview(false);
  }

  // Group projects by view
  const grouped: Record<string, ProjectWithStats[]> = {};
  for (const p of projects) {
    let key: string;
    if (view === "status") key = p.status;
    else if (view === "department") key = p.owner_department || "Unassigned";
    else if (view === "priority") key = p.priority;
    else key = healthScores.get(p.id)?.status ?? "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

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
    <PageShell title="Portfolio" description="Executive cross-project control tower">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-700">{error}</div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Total", value: stats.total, color: "" },
            { label: "Active", value: stats.active, color: "text-blue-600" },
            { label: "Blocked", value: stats.blocked, color: stats.blocked > 0 ? "text-red-600" : "" },
            { label: "Critical", value: stats.critical, color: stats.critical > 0 ? "text-red-600" : "" },
            { label: "Completed", value: stats.completed, color: "text-emerald-600" },
            { label: "Overdue", value: stats.overdue, color: stats.overdue > 0 ? "text-red-600" : "" },
            { label: "Avg Health", value: `${stats.avgHealth}%`, color: stats.avgHealth >= 75 ? "text-emerald-600" : stats.avgHealth >= 50 ? "text-amber-600" : "text-red-600" },
          ].map((s) => (
            <Card key={s.label} className="stat-card">
              <CardContent className="p-4 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View toggle + actions */}
      <div className="action-bar">
        <div className="flex items-center border rounded-lg overflow-hidden">
          {VIEWS.map((v) => (
            <Button key={v} variant={view === v ? "secondary" : "ghost"} size="sm" className="rounded-none h-8 px-3 capitalize text-xs" onClick={() => setView(v)}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" disabled={runningReview} onClick={runReview}>
          {runningReview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
          Run Portfolio Review
        </Button>
      </div>

      {/* Executive Signals */}
      {signals.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50">
              <AlertOctagon className="h-4 w-4 text-red-500" />
            </div>
            <h2 className="section-title">Executive Signals</h2>
            <Badge className="bg-red-100 text-red-700 text-xs">{signals.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {signals.map((signal, i) => (
              <Card key={i} className={`stat-card border-l-2 ${
                signal.severity === "high" ? "border-l-red-500" :
                signal.severity === "medium" ? "border-l-amber-500" :
                "border-l-blue-400"
              }`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge className={`text-[10px] ${
                      signal.severity === "high" ? "bg-red-100 text-red-700" :
                      signal.severity === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{signal.severity}</Badge>
                  </div>
                  <p className="text-sm">{signal.message}</p>
                  {signal.type === "hiring_needed" && (
                    <Link href="/hiring" className="text-xs text-primary hover:underline flex items-center gap-1">
                      Go to Hiring <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Project Board by View */}
      <section>
        <h2 className="section-title mb-3">Projects by {view}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.entries(grouped).map(([key, projs]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-2">
                {view === "status" && <Badge className={`text-xs ${statusColors[key] ?? ""}`}>{key}</Badge>}
                {view === "health" && <Badge className={`text-xs ${healthColors[key]?.bg ?? ""} ${healthColors[key]?.color ?? ""}`}>{key}</Badge>}
                {view === "department" && <span className="text-xs font-semibold">{key}</span>}
                {view === "priority" && <span className="text-xs font-semibold capitalize">{key}</span>}
                <span className="text-xs text-muted-foreground">({projs.length})</span>
              </div>
              {projs.map((p) => {
                const h = healthScores.get(p.id);
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <Card className="stat-card hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">{p.project_code}</Badge>
                          {h && (
                            <div className={`h-2 w-2 rounded-full ${
                              h.status === "healthy" ? "bg-emerald-500" :
                              h.status === "watch" ? "bg-amber-500" :
                              h.status === "at_risk" ? "bg-orange-500" :
                              "bg-red-500"
                            }`} />
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${
                            p.progress >= 75 ? "bg-emerald-500" :
                            p.progress >= 50 ? "bg-blue-500" :
                            p.progress >= 25 ? "bg-amber-500" :
                            "bg-red-500"
                          }`} style={{ width: `${p.progress}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{p.progress}%</span>
                          {p.blocked_tasks > 0 && <span className="text-red-600">{p.blocked_tasks} blocked</span>}
                          {p.due_date && <span>Due {new Date(p.due_date).toLocaleDateString()}</span>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Portfolio Review */}
      {review && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
              <Shield className="h-4 w-4 text-violet-600" />
            </div>
            <h2 className="section-title">Portfolio Review</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600">Top Risks</p>
                {review.topRisks.length > 0 ? review.topRisks.map((r, i) => (
                  <p key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" /> {r}
                  </p>
                )) : <p className="text-sm text-muted-foreground">No risks detected</p>}
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">Recommended Actions</p>
                {review.recommendedActions.map((a, i) => (
                  <p key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <ChevronRight className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" /> {a}
                  </p>
                ))}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Most efficient: <span className="font-medium text-foreground">{review.mostEfficientDept}</span></p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </PageShell>
  );
}
