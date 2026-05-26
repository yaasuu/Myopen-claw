"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  AlertTriangle,
  Bell,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Bot,
  ArrowRight,
  Clock,
  TrendingDown,
  Radio,
  FileText,
  Zap,
  Send,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { getBlockedTasks, getTasks } from "@/lib/data/tasks";
import { getCriticalFeedEvents } from "@/lib/data/feed";
import { getPausedAgents } from "@/lib/data/alerts";
import { getSystemStatus } from "@/lib/data/system";
import { getAgents } from "@/lib/data/agents";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { TaskWithAgent, FeedEvent, Agent, SystemStatus } from "@/types/dashboard";
import { timeAgo } from "@/lib/utils";

const DRIFT_HOURS = 48;

const HERMES_DOCS = [
  {
    title: "system_status writes",
    description: "Hermes writes to the `system_status` table to broadcast health: `status` ('healthy' | 'degraded' | 'down'), `agent_count`, `active_tasks`, `message`.",
    table: "system_status",
  },
  {
    title: "feed_events writes",
    description: "Hermes logs dispatches and decisions as `agent_routed`, `task_completed`, `blocker_detected` events in `feed_events`.",
    table: "feed_events",
  },
  {
    title: "tasks writes",
    description: "Hermes updates `tasks` directly: sets `owner_agent_id`, `handled_by_agent_id`, `dispatch_notes`, `dispatched_at`, and advances `status`.",
    table: "tasks",
  },
  {
    title: "task_reviews writes",
    description: "Hermes's reviewer agent writes to `task_reviews` with `outcome` and `evidence` when a checkpoint passes.",
    table: "task_reviews",
  },
];

const prioritySeverity: Record<string, { label: string; color: string; dot: string }> = {
  high: { label: "High", color: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)] border-red-200", dot: "dot-red" },
  medium: { label: "Medium", color: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)] border-amber-200", dot: "dot-amber" },
  low: { label: "Low", color: "bg-transparent text-[var(--text-muted)] border-[var(--border)]", dot: "bg-gray-400" },
};

export default function AlertsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"alerts" | "hermes">("alerts");

  const [blocked, setBlocked] = useState<TaskWithAgent[]>([]);
  const [driftTasks, setDriftTasks] = useState<TaskWithAgent[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allTasks, setAllTasks] = useState<TaskWithAgent[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [blockedResult, eventsResult, pausedResult, statusResult, allTasksResult, agentsResult] = await Promise.all([
        getBlockedTasks(),
        getCriticalFeedEvents(10),
        getPausedAgents(),
        getSystemStatus(),
        getTasks({ includeArchived: false }),
        getAgents(),
      ]);

      const errors = [blockedResult.error, eventsResult.error, pausedResult.error, statusResult.error].filter(Boolean);
      if (errors.length > 0) setError(errors.join("; "));

      setBlocked(blockedResult.data);
      setCriticalEvents(eventsResult.data);
      setPausedAgents(pausedResult.data);
      setSystemStatus(statusResult.data);
      setAgents(agentsResult.data);
      setAllTasks(allTasksResult.data);

      // Drift detection: tasks stuck in an active status for > DRIFT_HOURS
      const driftCutoff = Date.now() - DRIFT_HOURS * 3600 * 1000;
      setDriftTasks(
        allTasksResult.data.filter(
          (t) =>
            !["done", "pending", "approved", "blocked"].includes(t.status) &&
            new Date(t.updated_at).getTime() < driftCutoff
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "agents", "feed_events", "system_status"], loadRef);

  useEffect(() => {
    load();
  }, []);

  const totalAlerts = blocked.length + driftTasks.length + pausedAgents.length + (systemStatus && systemStatus.status !== "healthy" ? 1 : 0);

  // Hermes tab derived data
  const dispatched = allTasks.filter(
    (t) => t.owner_agent_id || t.status === "dispatched" || t.status === "in-progress"
  );
  const byAgent = agents
    .map((agent) => ({
      agent,
      tasks: dispatched.filter(
        (t) => t.owner_agent_id === agent.id || t.assigned_agent_id === agent.id
      ),
    }))
    .filter((row) => row.tasks.length > 0);

  const hermesStatusConfig = {
    healthy:  { label: "Healthy",  dot: "dot-green", color: "var(--success)", bg: "rgba(16,185,129,0.08)" },
    degraded: { label: "Degraded", dot: "dot-amber", color: "var(--warning)", bg: "rgba(245,158,11,0.08)" },
    down:     { label: "Down",     dot: "dot-red",   color: "var(--danger)",  bg: "rgba(239,68,68,0.08)" },
  };
  const hs = hermesStatusConfig[systemStatus?.status ?? "healthy"];

  if (loading) {
    return (
      <PageShell title="Alerts" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading alerts...
        </div>
      </PageShell>
    );
  }

  if (error && totalAlerts === 0) {
    return (
      <PageShell title="Alerts" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load alerts</p>
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

  return (
    <PageShell>
      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          Some data may be stale: {error}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Blockers · drift · paused agents · critical events
          </p>
        </div>
        {activeTab === "alerts" && (totalAlerts > 0 ? (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
               style={{ borderColor: "rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--danger)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--danger)" }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
              {totalAlerts} active alert{totalAlerts !== 1 ? "s" : ""}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
               style={{ borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.06)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--success)" }}>All clear</span>
          </div>
        ))}
        {activeTab === "hermes" && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
               style={{ borderColor: hs.color + "40", background: hs.bg }}>
            <span className="relative flex h-2 w-2">
              {systemStatus?.status === "healthy" && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: hs.color }} />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: hs.color }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: hs.color }}>{hs.label}</span>
            {systemStatus?.last_event && (
              <span className="text-[10px] truncate max-w-[160px]" style={{ color: "var(--text-quiet)" }}>
                · {timeAgo(systemStatus.last_event)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--surface-muted)", width: "fit-content" }}>
        {(["alerts", "hermes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize"
            style={{
              background: activeTab === tab ? "var(--text)" : "transparent",
              color: activeTab === tab ? "var(--surface)" : "var(--text-muted)",
            }}
          >
            {tab === "hermes" ? "Hermes" : "Alerts"}
          </button>
        ))}
      </div>

      {activeTab === "alerts" && <>
      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Blockers",       val: blocked.length,        sub: "tasks stuck",        color: blocked.length > 0 ? "var(--danger)" : "var(--text-quiet)",       bg: "rgba(220,38,38,0.08)", icon: AlertTriangle },
          { label: "Drift",          val: driftTasks.length,     sub: `no update > ${DRIFT_HOURS}h`, color: driftTasks.length > 0 ? "var(--warning)" : "var(--text-quiet)", bg: "rgba(245,158,11,0.08)", icon: TrendingDown },
          { label: "Paused",         val: pausedAgents.length,   sub: "agents",             color: pausedAgents.length > 0 ? "var(--warning)" : "var(--text-quiet)", bg: "rgba(245,158,11,0.08)", icon: Bot },
          { label: "Critical Events",val: criticalEvents.length, sub: "last 10",            color: criticalEvents.length > 0 ? "var(--info)" : "var(--text-quiet)",   bg: "rgba(37,99,235,0.08)", icon: ShieldAlert },
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

      {/* Section 1: Active Blockers — actionable cards */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-[var(--danger)]" />
          <h2 className="text-sm font-semibold">Active Blockers</h2>
          {blocked.length > 0 && <Badge variant="destructive" className="text-xs">{blocked.length}</Badge>}
        </div>

        {blocked.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No blocked tasks — all work is moving
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {blocked.map((task) => {
              const sev = prioritySeverity[task.priority] ?? prioritySeverity.medium;
              return (
                <Card key={task.id} className={`border-l-4 ${task.priority === "high" ? "border-l-red-500" : task.priority === "medium" ? "border-l-amber-500" : "border-l-gray-300"}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{task.title}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sev.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sev.dot} mr-1`} />
                            {sev.label} priority
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" />
                          {task.blocker}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {task.assigned_agent_name && (
                            <Link href={`/agents/${task.assigned_agent_id}`} className="hover:underline flex items-center gap-1">
                              {task.assigned_agent_emoji} {task.assigned_agent_name}
                            </Link>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(task.updated_at)}
                          </span>
                        </div>
                      </div>
                      <Link href="/tasks">
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                          View in Tasks
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Drift Detection */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4" style={{ color: "var(--warning)" }} />
          <h2 className="text-sm font-semibold">Drift Detection</h2>
          <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
            stale &gt;{DRIFT_HOURS}h
          </span>
          {driftTasks.length > 0 && <Badge className="bg-[rgba(245,158,11,0.12)] text-[var(--warning)] text-xs">{driftTasks.length}</Badge>}
        </div>
        {driftTasks.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No drifting tasks — all active work has moved recently
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {driftTasks.map((task) => {
              const staleHours = Math.round((Date.now() - new Date(task.updated_at).getTime()) / 3600000);
              return (
                <Card key={task.id} className="border-l-4 border-l-amber-400">
                  <CardContent className="flex items-center gap-3 py-3">
                    <TrendingDown className="h-4 w-4 shrink-0" style={{ color: "var(--warning)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.08)", color: "var(--warning)" }}>
                          {task.status}
                        </span>
                        {task.assigned_agent_name && (
                          <Link href={`/agents/${task.assigned_agent_id}`} className="hover:underline flex items-center gap-1">
                            {task.assigned_agent_emoji} {task.assigned_agent_name}
                          </Link>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          No update for {staleHours}h
                        </span>
                      </div>
                    </div>
                    <Link href="/tasks">
                      <Button variant="outline" size="sm" className="gap-1 shrink-0">
                        Review <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 3: System & Agent Warnings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-yellow-500" />
          <h2 className="text-sm font-semibold">System &amp; Agent Warnings</h2>
          {(pausedAgents.length > 0 || (systemStatus && systemStatus.status !== "healthy")) && (
            <Badge className="bg-yellow-100 text-yellow-700 text-xs">
              {pausedAgents.length + (systemStatus && systemStatus.status !== "healthy" ? 1 : 0)}
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          {/* System status warning */}
          {systemStatus && systemStatus.status !== "healthy" && (
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertTriangle className="h-5 w-5 text-[var(--danger)] shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">System Status: {systemStatus.status}</p>
                  <p className="text-xs text-[var(--danger)]">
                    {systemStatus.blocked_tasks} blocked · {systemStatus.open_tasks} open tasks
                  </p>
                </div>
                <Badge variant="destructive">{systemStatus.status}</Badge>
              </CardContent>
            </Card>
          )}

          {/* Paused agents */}
          {pausedAgents.map((agent) => (
            <Card key={agent.id} className="border-l-4 border-l-amber-400">
              <CardContent className="flex items-center gap-3 py-4">
                <span className="text-xl">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{agent.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{agent.domain}</p>
                </div>
                <Badge className="bg-yellow-100 text-yellow-700 shrink-0">Paused</Badge>
                <Link href={`/agents/${agent.id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                    Manage
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}

          {/* All clear */}
          {pausedAgents.length === 0 && (!systemStatus || systemStatus.status === "healthy") && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No active warnings — all agents operational, system healthy
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Section 4: Recent Critical Events */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold">Recent Critical Events</h2>
          {criticalEvents.length > 0 && <Badge className="bg-[rgba(245,158,11,0.12)] text-[var(--warning)] text-xs">{criticalEvents.length}</Badge>}
        </div>

        <Card>
          <CardContent className="p-0">
            {criticalEvents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No critical events recorded
              </div>
            ) : (
              <div className="divide-y">
                {criticalEvents.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                      event.event_type === "blocker_detected" ? "dot-red" :
                      event.event_type === "system_alert" ? "dot-amber" :
                      "bg-yellow-500"
                    }`} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm">{event.summary}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {event.event_type.replace(/_/g, " ")}
                        </Badge>
                        <span>{timeAgo(event.created_at)}</span>
                        <span>{event.source}</span>
                      </div>
                    </div>
                    {event.related_agent_id && (
                      <Link href={`/agents/${event.related_agent_id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0">
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      </>}

      {activeTab === "hermes" && <>
        {/* ── Hermes KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Active Agents",  val: systemStatus?.active_agents ?? agents.length,                            sub: "online",          icon: Bot,      color: "var(--accent)",  bg: "var(--accent-soft)" },
            { label: "In Progress",    val: dispatched.filter((t) => t.status === "in-progress").length,              sub: "executing",       icon: Zap,      color: "var(--info)",    bg: "rgba(37,99,235,0.08)" },
            { label: "In Dispatch",    val: dispatched.filter((t) => t.status === "dispatched").length,               sub: "awaiting pickup", icon: Send,     color: "var(--warning)", bg: "rgba(245,158,11,0.08)" },
            { label: "Pending Review", val: dispatched.filter((t) => t.status === "in-review" || t.status === "submitted").length, sub: "needs Yas",       icon: FileText, color: "var(--success)", bg: "rgba(16,185,129,0.08)" },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dispatch queue */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Radio className="h-4 w-4" style={{ color: "var(--accent)" }} />
                Dispatch Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {dispatched.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2" style={{ color: "var(--text-quiet)" }}>
                  <CheckCircle2 className="h-8 w-8" style={{ color: "var(--success)" }} />
                  <p className="text-sm font-medium">Queue is clear</p>
                  <p className="text-xs">No tasks currently dispatched to Hermes.</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {dispatched.slice(0, 10).map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-muted)] transition-colors">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        task.status === "in-progress" ? "dot-blue" :
                        task.status === "dispatched" ? "dot-amber" :
                        task.status === "submitted" || task.status === "in-review" ? "dot-green" :
                        "dot-gray"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.assigned_agent_name && (
                            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
                              {task.assigned_agent_emoji} {task.assigned_agent_name}
                            </span>
                          )}
                          {task.dispatch_notes && (
                            <span className="text-[10px] italic truncate" style={{ color: "var(--text-quiet)", maxWidth: "140px" }}>
                              &ldquo;{task.dispatch_notes}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          style={{
                            color: task.status === "in-progress" ? "var(--info)" : task.status === "dispatched" ? "var(--warning)" : "var(--success)",
                          }}
                        >
                          {task.status}
                        </Badge>
                        <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
                          {timeAgo(task.dispatched_at ?? task.updated_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agent Workloads */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4" style={{ color: "var(--accent)" }} />
                Agent Workloads
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {byAgent.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2" style={{ color: "var(--text-quiet)" }}>
                  <AlertCircle className="h-8 w-8" />
                  <p className="text-sm">No active agent workloads</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {byAgent.map(({ agent, tasks: agentTasks }) => (
                    <div key={agent.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{agent.emoji}</span>
                        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{agent.name}</span>
                        <span className="ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                          {agentTasks.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {agentTasks.slice(0, 3).map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${t.status === "in-progress" ? "dot-blue" : t.status === "dispatched" ? "dot-amber" : "dot-green"}`} />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                        {agentTasks.length > 3 && (
                          <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>+{agentTasks.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Integration Reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
              Hermes → Dashboard Integration Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {HERMES_DOCS.map((doc) => (
                <div key={doc.table} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                      {doc.table}
                    </code>
                    <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{doc.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{doc.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </>}
    </PageShell>
  );
}
