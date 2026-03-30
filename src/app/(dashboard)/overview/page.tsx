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
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Bell,
  ArrowRight,
  ShieldAlert,
  Activity,
  TrendingUp,
} from "lucide-react";
import { getSystemStatus } from "@/lib/data/system";
import { getTaskStats, getBlockedTasks } from "@/lib/data/tasks";
import { getFeedEvents, getCriticalFeedEvents } from "@/lib/data/feed";
import { getPausedAgents } from "@/lib/data/alerts";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { SystemStatus, TaskWithAgent, FeedEvent, Agent } from "@/types/dashboard";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [taskStats, setTaskStats] = useState({ total: 0, pending: 0, inProgress: 0, blocked: 0, done: 0 });
  const [blocked, setBlocked] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sResult, stats, bResult, eResult, pausedResult, critResult] = await Promise.all([
        getSystemStatus(),
        getTaskStats(),
        getBlockedTasks(),
        getFeedEvents(5),
        getPausedAgents(),
        getCriticalFeedEvents(3),
      ]);

      const errors = [sResult.error, bResult.error, eResult.error, pausedResult.error, critResult.error].filter(Boolean);
      if (errors.length > 0) setError(errors.join("; "));

      setStatus(sResult.data);
      setTaskStats(stats);
      setBlocked(bResult.data);
      setEvents(eResult.data);
      setPausedAgents(pausedResult.data);
      setCriticalEvents(critResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  const { connected, lastSynced } = useRealtimeMulti(
    ["tasks", "agents", "feed_events", "system_status"],
    loadRef
  );

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <PageShell title="Overview" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading dashboard...
        </div>
      </PageShell>
    );
  }

  if (error && !status) {
    return (
      <PageShell title="Overview" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load dashboard</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const needsAttention = taskStats.blocked > 0 || pausedAgents.length > 0;

  const summaryCards = [
    {
      title: "Active Agents",
      value: String(status?.active_agents ?? 0),
      icon: Bot,
      description: status?.active_agents ? "Operational" : "None active",
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: "Open Tasks",
      value: String(taskStats.total - taskStats.done),
      icon: TrendingUp,
      description: `${taskStats.inProgress} in progress`,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Blocked",
      value: String(taskStats.blocked),
      icon: AlertTriangle,
      description: taskStats.blocked > 0 ? "Needs attention" : "All clear",
      color: taskStats.blocked > 0 ? "text-red-600" : "text-muted-foreground",
      bg: taskStats.blocked > 0 ? "bg-red-50" : "bg-muted/50",
    },
    {
      title: "Completed",
      value: String(taskStats.done),
      icon: CheckCircle2,
      description: `${taskStats.total} total tasks`,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <PageShell title="Overview" description="Operating summary">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-700">
          Some data may be stale: {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className="stat-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {card.title}
                </span>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              <div className={`text-2xl font-bold tracking-tight ${card.color === "text-muted-foreground" ? "" : card.color}`}>
                {card.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attention needed */}
      {needsAttention && (
        <Link href="/alerts" className="block">
          <Card className="border-amber-200/60 bg-gradient-to-r from-amber-50/80 to-orange-50/40 hover:from-amber-50 hover:to-orange-50/60 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4 px-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <Bell className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">Attention Needed</p>
                <p className="text-xs text-amber-700">
                  {taskStats.blocked > 0 && `${taskStats.blocked} blocked task${taskStats.blocked !== 1 ? "s" : ""}`}
                  {taskStats.blocked > 0 && pausedAgents.length > 0 && " · "}
                  {pausedAgents.length > 0 && `${pausedAgents.length} paused agent${pausedAgents.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Badge className="bg-amber-200/80 text-amber-800 font-semibold">{taskStats.blocked + pausedAgents.length}</Badge>
              <ArrowRight className="h-4 w-4 text-amber-500" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Three-column signal row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Blocked tasks */}
        <Card className="stat-card">
          <CardHeader className="pb-3 px-5 pt-5">
            <div className="flex items-center justify-between">
              <CardTitle className="section-title flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-50">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                </div>
                Blocked Tasks
              </CardTitle>
              {blocked.length > 0 && <Badge variant="destructive" className="text-xs">{blocked.length}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {blocked.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                All clear
              </div>
            ) : (
              <div className="space-y-2.5">
                {blocked.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.blocker}</p>
                    {task.assigned_agent_name && (
                      <Link href={`/agents/${task.assigned_agent_id}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                        {task.assigned_agent_emoji} {task.assigned_agent_name}
                      </Link>
                    )}
                  </div>
                ))}
                {blocked.length > 3 && (
                  <Link href="/alerts" className="text-xs text-primary hover:underline block text-center pt-1 font-medium">
                    View all {blocked.length} blocked →
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paused agents */}
        <Card className="stat-card">
          <CardHeader className="pb-3 px-5 pt-5">
            <div className="flex items-center justify-between">
              <CardTitle className="section-title flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50">
                  <Bot className="h-3.5 w-3.5 text-amber-500" />
                </div>
                Paused Agents
              </CardTitle>
              {pausedAgents.length > 0 && <Badge className="bg-amber-100 text-amber-700 text-xs">{pausedAgents.length}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {pausedAgents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                All agents active
              </div>
            ) : (
              <div className="space-y-2.5">
                {pausedAgents.map((agent) => (
                  <Link key={agent.id} href={`/agents/${agent.id}`} className="block rounded-lg border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{agent.domain}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Critical events */}
        <Card className="stat-card">
          <CardHeader className="pb-3 px-5 pt-5">
            <div className="flex items-center justify-between">
              <CardTitle className="section-title flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-50">
                  <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
                </div>
                Critical Events
              </CardTitle>
              {criticalEvents.length > 0 && (
                <Link href="/alerts">
                  <Badge className="bg-orange-100 text-orange-700 text-xs cursor-pointer hover:bg-orange-200 transition-colors">
                    {criticalEvents.length}
                  </Badge>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {criticalEvents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No critical events
              </div>
            ) : (
              <div className="space-y-2.5">
                {criticalEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-sm truncate">{event.summary}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</p>
                  </div>
                ))}
                <Link href="/alerts" className="text-xs text-primary hover:underline block text-center pt-1 font-medium">
                  View all alerts →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity + system */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="stat-card">
          <CardHeader className="pb-3 px-5 pt-5">
            <CardTitle className="section-title flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {events.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground font-medium tabular-nums">
                      {timeAgo(event.created_at)}
                    </span>
                    <span className="flex-1 text-muted-foreground">{event.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-3 px-5 pt-5">
            <CardTitle className="section-title flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {status?.last_event ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${status.status === "healthy" ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-sm font-medium capitalize">{status.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last activity: {new Date(status.last_event).toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                    <div className="text-lg font-bold">{status.open_tasks}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Open</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                    <div className="text-lg font-bold text-red-600">{status.blocked_tasks}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Blocked</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                    <div className="text-lg font-bold text-emerald-600">{status.active_agents}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No system activity recorded</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
