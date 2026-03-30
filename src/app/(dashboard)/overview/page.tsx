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
      highlight: false,
    },
    {
      title: "Open Tasks",
      value: String(taskStats.total - taskStats.done),
      icon: Clock,
      description: `${taskStats.inProgress} in progress`,
      highlight: false,
    },
    {
      title: "Blocked",
      value: String(taskStats.blocked),
      icon: AlertTriangle,
      description: taskStats.blocked > 0 ? "Needs attention" : "All clear",
      highlight: taskStats.blocked > 0,
    },
    {
      title: "Completed",
      value: String(taskStats.done),
      icon: CheckCircle2,
      description: `${taskStats.total} total tasks`,
      highlight: false,
    },
  ];

  return (
    <PageShell
      title="Overview"
      description={`Operating summary — last updated ${status?.checked_at ? new Date(status.checked_at).toLocaleTimeString() : "just now"}`}
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Some data may be stale: {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className={card.highlight ? "border-red-200" : undefined}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`h-4 w-4 ${card.highlight ? "text-red-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.highlight ? "text-red-600" : ""}`}>{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attention needed — unified alert bar */}
      {needsAttention && (
        <Link href="/alerts">
          <Card className="border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 py-4">
              <Bell className="h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">Attention Needed</p>
                <p className="text-xs text-amber-600">
                  {taskStats.blocked > 0 && `${taskStats.blocked} blocked task${taskStats.blocked !== 1 ? "s" : ""}`}
                  {taskStats.blocked > 0 && pausedAgents.length > 0 && " · "}
                  {pausedAgents.length > 0 && `${pausedAgents.length} paused agent${pausedAgents.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Badge className="bg-amber-200 text-amber-800">{taskStats.blocked + pausedAgents.length}</Badge>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Three-column signal row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Blocked tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Blocked Tasks
            </CardTitle>
            {blocked.length > 0 && <Badge variant="destructive" className="text-xs">{blocked.length}</Badge>}
          </CardHeader>
          <CardContent>
            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">All clear</p>
            ) : (
              <div className="space-y-3">
                {blocked.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-md border p-3 space-y-1">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.blocker}</p>
                    {task.assigned_agent_name && (
                      <Link href={`/agents/${task.assigned_agent_id}`} className="text-xs text-blue-600 hover:underline">
                        {task.assigned_agent_emoji} {task.assigned_agent_name}
                      </Link>
                    )}
                  </div>
                ))}
                {blocked.length > 3 && (
                  <Link href="/alerts" className="text-xs text-blue-600 hover:underline block text-center pt-1">
                    View all {blocked.length} blocked →
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paused agents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-amber-500" />
              Paused Agents
            </CardTitle>
            {pausedAgents.length > 0 && <Badge className="bg-amber-100 text-amber-700 text-xs">{pausedAgents.length}</Badge>}
          </CardHeader>
          <CardContent>
            {pausedAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">All agents active</p>
            ) : (
              <div className="space-y-3">
                {pausedAgents.map((agent) => (
                  <Link key={agent.id} href={`/agents/${agent.id}`} className="block rounded-md border p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{agent.domain}</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent critical events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-500" />
              Critical Events
            </CardTitle>
            {criticalEvents.length > 0 && (
              <Link href="/alerts">
                <Badge className="bg-orange-100 text-orange-700 text-xs cursor-pointer hover:bg-orange-200">
                  {criticalEvents.length}
                </Badge>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {criticalEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No critical events</p>
            ) : (
              <div className="space-y-3">
                {criticalEvents.map((event) => (
                  <div key={event.id} className="rounded-md border p-3 space-y-1">
                    <p className="text-sm truncate">{event.summary}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</p>
                  </div>
                ))}
                <Link href="/alerts" className="text-xs text-blue-600 hover:underline block text-center pt-1">
                  View all alerts →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity + last system activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {timeAgo(event.created_at)}
                    </span>
                    <span className="flex-1">{event.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Last System Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {status?.last_event ? (
              <div className="space-y-2">
                <p className="text-sm">{new Date(status.last_event).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  System status: <span className={status.status === "healthy" ? "text-emerald-600" : "text-red-600"}>{status.status}</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No system activity recorded</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
