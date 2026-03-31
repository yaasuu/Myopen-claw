"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Shield,
  Zap,
  TrendingUp,
  Layers,
  Target,
  Clock,
  Play,
  CheckCircle2,
  ArrowRight,
  Activity,
  Bot,
  Users,
  AlertOctagon,
  ChevronRight,
} from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { analyzeHiringNeeds } from "@/lib/data/hiring";
import { logFeedEvent } from "@/lib/data/feed-events";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import {
  deriveAutonomyState,
  generateLoopSummaries,
  generateExecutiveReviews,
  generateRecommendedActions,
  type AutonomyState,
  type AutonomyStatus,
  type ReviewLoop,
  type LoopType,
  type ExecutiveReview,
  type RecommendedAction,
} from "@/lib/data/autonomy";
import type { Agent, TaskWithAgent } from "@/types/dashboard";

const stateStyles: Record<AutonomyState, { label: string; color: string; bg: string; icon: typeof Shield }> = {
  STABLE: { label: "Stable", color: "text-[var(--success)]", bg: "bg-[rgba(16,185,129,0.08)] border-emerald-200", icon: Shield },
  OPTIMIZING: { label: "Optimizing", color: "text-[var(--info)]", bg: "bg-[rgba(59,130,246,0.08)] border-blue-200", icon: TrendingUp },
  EXPANDING: { label: "Expanding", color: "text-[var(--accent)]", bg: "bg-[rgba(139,92,246,0.08)] border-violet-200", icon: Layers },
  RESTRUCTURING: { label: "Restructuring", color: "text-[var(--warning)]", bg: "bg-[rgba(245,158,11,0.08)] border-amber-200", icon: Target },
  CRITICAL_INTERVENTION: { label: "Critical", color: "text-[var(--danger)]", bg: "bg-[rgba(239,68,68,0.08)] border-red-200", icon: AlertOctagon },
};

const loopIcons: Record<LoopType, typeof Activity> = {
  daily: Activity,
  weekly: TrendingUp,
  monthly: Target,
  quarterly: Layers,
};

const actionIcons: Record<string, typeof Bot> = {
  activate_agent: Bot,
  hire_agent: Users,
  rebalance: Layers,
  escalate_blocker: AlertTriangle,
  review_governance: Shield,
  expand_department: TrendingUp,
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AutonomyPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [autonomyStatus, setAutonomyStatus] = useState<AutonomyStatus | null>(null);
  const [loops, setLoops] = useState<Record<LoopType, ReviewLoop> | null>(null);
  const [reviews, setReviews] = useState<ExecutiveReview[]>([]);
  const [actions, setActions] = useState<RecommendedAction[]>([]);
  const [runningLoop, setRunningLoop] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tasksResult, agentsResult] = await Promise.all([getTasks(), getAgents()]);
      if (tasksResult.error) setError(tasksResult.error);
      if (agentsResult.error) setError(agentsResult.error);

      const t = tasksResult.data;
      const a = agentsResult.data;
      const recs = analyzeHiringNeeds(t, a);

      setTasks(t);
      setAgents(a);
      setAutonomyStatus(deriveAutonomyState(t, a, recs));
      setLoops(generateLoopSummaries(t, a, recs));
      setReviews(generateExecutiveReviews(t, a, deriveAutonomyState(t, a, recs).signals));
      setActions(generateRecommendedActions(t, a, deriveAutonomyState(t, a, recs).signals));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "agents", "feed_events"], loadRef);

  useEffect(() => {
    load();
  }, []);

  async function runLoop(type: LoopType) {
    setRunningLoop(type);
    await logFeedEvent({
      event_type: `governance_${type}_run`,
      source: "Yas Claw",
      summary: `${type.charAt(0).toUpperCase() + type.slice(1)} review loop executed`,
    });
    setTimeout(() => {
      setRunningLoop(null);
      load();
    }, 1500);
  }

  if (loading) {
    return (
      <PageShell title="Autonomy Center" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing system state...
        </div>
      </PageShell>
    );
  }

  if (error && !autonomyStatus) {
    return (
      <PageShell title="Autonomy Center" description="Error">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-[var(--info)] hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const state = autonomyStatus?.state ?? "STABLE";
  const stateStyle = stateStyles[state];
  const StateIcon = stateStyle.icon;

  return (
    <PageShell title="Autonomy Center" description="Governed operating loops and executive oversight">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {/* ── Autonomy State Banner ─────────────────── */}
      <Card className={`stat-card border-2 ${stateStyle.bg}`}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stateStyle.bg}`}>
                <StateIcon className={`h-6 w-6 ${stateStyle.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <h2 className="text-lg font-bold tracking-tight">System Autonomy</h2>
                  <Badge className={`${stateStyle.bg} ${stateStyle.color} font-semibold`}>
                    {stateStyle.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl">
                  {autonomyStatus?.reasoning}
                </p>
              </div>
            </div>
            {canWrite && (
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5" />
                Recalculate
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Review Loops ──────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.08)]">
            <Zap className="h-4 w-4 text-[var(--info)]" />
          </div>
          <h2 className="section-title">Review Loops</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {loops && (["daily", "weekly", "monthly", "quarterly"] as LoopType[]).map((type) => {
            const loop = loops[type];
            const LoopIcon = loopIcons[type];
            const s = loop.summary;

            return (
              <Card key={type} className="stat-card">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                        <LoopIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{loop.label}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{type} loop</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tasks reviewed</span>
                      <span className="font-medium">{s.tasksReviewed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Blockers escalated</span>
                      <span className={`font-medium ${s.blockersEscalated > 0 ? "text-[var(--danger)]" : ""}`}>{s.blockersEscalated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Actions proposed</span>
                      <span className="font-medium">{s.actionsProposed}</span>
                    </div>
                    {type !== "daily" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hire recommendations</span>
                        <span className="font-medium">{s.hireRecommendations}</span>
                      </div>
                    )}
                    {type === "quarterly" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Redesign readiness</span>
                        <span className="font-medium">{s.redesignReadiness}%</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {loop.lastRun ? `Last: ${timeAgo(loop.lastRun)}` : "Not yet run"}
                    </span>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={runningLoop === type}
                        onClick={() => runLoop(type)}
                      >
                        {runningLoop === type ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Run
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Executive Reviews ─────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
            <Shield className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <h2 className="section-title">Executive Reviews</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {reviews.map((review) => (
            <Card key={review.id} className="stat-card">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{review.title}</p>
                  <Badge variant="outline" className="text-[10px]">{review.type}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{review.summary}</p>

                {review.keyRisks.length > 0 && review.keyRisks[0] !== "No critical risks" && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]">Key Risks</p>
                    {review.keyRisks.map((risk, i) => (
                      <p key={i} className="text-xs text-[var(--danger)]/80 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {risk}
                      </p>
                    ))}
                  </div>
                )}

                {review.recommendations.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--info)]">Recommendations</p>
                    {review.recommendations.map((rec, i) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ChevronRight className="h-3 w-3 shrink-0" />
                        {rec}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Autonomy Signals ──────────────────────── */}
      {autonomyStatus && autonomyStatus.signals.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(245,158,11,0.08)]">
              <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
            </div>
            <h2 className="section-title">Autonomy Signals</h2>
            <Badge className="bg-[rgba(245,158,11,0.12)] text-[var(--warning)] text-xs">{autonomyStatus.signals.length}</Badge>
          </div>

          <div className="space-y-3">
            {autonomyStatus.signals.map((signal, i) => (
              <Card key={i} className={`stat-card border-l-2 ${
                signal.severity === "high" ? "border-l-red-500" :
                signal.severity === "medium" ? "border-l-amber-500" :
                "border-l-blue-400"
              }`}>
                <CardContent className="flex items-center gap-4 py-4 px-5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    signal.severity === "high" ? "bg-[rgba(239,68,68,0.08)]" :
                    signal.severity === "medium" ? "bg-[rgba(245,158,11,0.08)]" :
                    "bg-[rgba(59,130,246,0.08)]"
                  }`}>
                    <AlertTriangle className={`h-4 w-4 ${
                      signal.severity === "high" ? "text-[var(--danger)]" :
                      signal.severity === "medium" ? "text-[var(--warning)]" :
                      "text-blue-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{signal.message}</p>
                    <p className="text-xs text-muted-foreground capitalize">{signal.type.replace(/_/g, " ")}</p>
                  </div>
                  <Badge className={`text-xs ${
                    signal.severity === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                    signal.severity === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                    "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                  }`}>
                    {signal.severity}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Recommended Actions ───────────────────── */}
      {actions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.08)]">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <h2 className="section-title">Recommended Actions</h2>
            <Badge className="bg-[rgba(16,185,129,0.12)] text-[var(--success)] text-xs">{actions.length}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {actions.map((action) => {
              const ActIcon = actionIcons[action.type] ?? ArrowRight;
              return (
                <Card key={action.id} className={`stat-card border-l-2 ${
                  action.urgency === "high" ? "border-l-red-500" :
                  action.urgency === "medium" ? "border-l-amber-500" :
                  "border-l-blue-400"
                }`}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                          <ActIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{action.title}</p>
                          <Badge variant="outline" className="text-[10px] mt-1">{action.type.replace(/_/g, " ")}</Badge>
                        </div>
                      </div>
                      <Badge className={`text-xs ${
                        action.urgency === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                        action.urgency === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                        "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                      }`}>
                        {action.urgency}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                    {action.relatedAgentId && (
                      <Link href={`/agents/${action.relatedAgentId}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                        View agent <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── All Clear ─────────────────────────────── */}
      {autonomyStatus && autonomyStatus.signals.length === 0 && actions.length === 0 && (
        <Card className="stat-card">
          <CardContent className="flex items-center gap-4 py-8 px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(16,185,129,0.08)]">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">System Operating Normally</p>
              <p className="text-xs text-muted-foreground">No signals, no recommended actions. All departments balanced.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
