"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
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
  useRealtimeMulti(["tasks", "agents", "feed_events", "system_status"], loadRef);

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
        <Card className="card-executive">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load dashboard</p>
              <p className="text-caption">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-primary hover:underline flex items-center gap-1">
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
      label: "Active Agents",
      value: String(status?.active_agents ?? 0),
      sub: status?.active_agents ? "Operational" : "None active",
      icon: Bot,
      accent: "text-primary",
      iconBg: "bg-primary/[0.08]",
    },
    {
      label: "Open Tasks",
      value: String(taskStats.total - taskStats.done),
      sub: `${taskStats.inProgress} in progress`,
      icon: TrendingUp,
      accent: "text-blue-400",
      iconBg: "bg-blue-500/[0.08]",
    },
    {
      label: "Blocked",
      value: String(taskStats.blocked),
      sub: taskStats.blocked > 0 ? "Needs attention" : "All clear",
      icon: AlertTriangle,
      accent: taskStats.blocked > 0 ? "text-red-400" : "text-muted-foreground",
      iconBg: taskStats.blocked > 0 ? "bg-red-500/[0.08]" : "bg-white/[0.04]",
    },
    {
      label: "Completed",
      value: String(taskStats.done),
      sub: `${taskStats.total} total`,
      icon: CheckCircle2,
      accent: "text-emerald-400",
      iconBg: "bg-emerald-500/[0.08]",
    },
  ];

  return (
    <PageShell title="Overview" description="Operating summary">
      {error && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-xs text-amber-400">
          Some data may be stale: {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="stat-card-executive">
            <div className="flex items-center justify-between mb-3">
              <span className="text-label">{card.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconBg}`}>
                <card.icon className={`h-4 w-4 ${card.accent}`} />
              </div>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${card.accent}`}>
              {card.value}
            </div>
            <p className="text-caption mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Attention needed */}
      {needsAttention && (
        <Link href="/alerts" className="block">
          <div className="stat-card-executive border-l-2 border-l-amber-500 hover:border-l-amber-400 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/[0.08]">
                <Bell className="h-4 w-4 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">Attention Needed</p>
                <p className="text-caption">
                  {taskStats.blocked > 0 && `${taskStats.blocked} blocked task${taskStats.blocked !== 1 ? "s" : ""}`}
                  {taskStats.blocked > 0 && pausedAgents.length > 0 && " · "}
                  {pausedAgents.length > 0 && `${pausedAgents.length} paused agent${pausedAgents.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Badge className="bg-amber-500/[0.12] text-amber-400 text-xs font-semibold">{taskStats.blocked + pausedAgents.length}</Badge>
              <ArrowRight className="h-4 w-4 text-amber-500/50" />
            </div>
          </div>
        </Link>
      )}

      {/* Three-column signal row */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Blocked tasks */}
        <div className="card-executive">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/[0.08]">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                </div>
                <span className="text-subheading">Blocked Tasks</span>
              </div>
              {blocked.length > 0 && <Badge className="bg-red-500/[0.12] text-red-400 text-[10px]">{blocked.length}</Badge>}
            </div>
          </div>
          <div className="px-5 pb-5">
            {blocked.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-caption">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                All clear
              </div>
            ) : (
              <div className="space-y-2.5">
                {blocked.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                    <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-caption truncate">{task.blocker}</p>
                    {task.assigned_agent_name && (
                      <Link href={`/agents/${task.assigned_agent_id}`} className="text-xs text-primary hover:underline">
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
          </div>
        </div>

        {/* Paused agents */}
        <div className="card-executive">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/[0.08]">
                  <Bot className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <span className="text-subheading">Paused Agents</span>
              </div>
              {pausedAgents.length > 0 && <Badge className="bg-amber-500/[0.12] text-amber-400 text-[10px]">{pausedAgents.length}</Badge>}
            </div>
          </div>
          <div className="px-5 pb-5">
            {pausedAgents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-caption">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                All agents active
              </div>
            ) : (
              <div className="space-y-2.5">
                {pausedAgents.map((agent) => (
                  <Link key={agent.id} href={`/agents/${agent.id}`} className="block rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{agent.name}</p>
                        <p className="text-caption truncate">{agent.domain}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Critical events */}
        <div className="card-executive">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/[0.08]">
                  <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />
                </div>
                <span className="text-subheading">Critical Events</span>
              </div>
              {criticalEvents.length > 0 && (
                <Link href="/alerts">
                  <Badge className="bg-orange-500/[0.12] text-orange-400 text-[10px] cursor-pointer hover:bg-orange-500/[0.18] transition-colors">
                    {criticalEvents.length}
                  </Badge>
                </Link>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {criticalEvents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-caption">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No critical events
              </div>
            ) : (
              <div className="space-y-2.5">
                {criticalEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
                    <p className="text-sm text-foreground truncate">{event.summary}</p>
                    <p className="text-caption">{timeAgo(event.created_at)}</p>
                  </div>
                ))}
                <Link href="/alerts" className="text-xs text-primary hover:underline block text-center pt-1 font-medium">
                  View all alerts →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity + System */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card-executive">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04]">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-subheading">Recent Activity</span>
            </div>
          </div>
          <div className="px-5 pb-5">
            {events.length === 0 ? (
              <p className="py-4 text-caption">No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="w-14 shrink-0 text-caption font-medium tabular-nums">
                      {timeAgo(event.created_at)}
                    </span>
                    <span className="flex-1 text-[#A7B0BE]">{event.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card-executive">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.04]">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-subheading">System Status</span>
            </div>
          </div>
          <div className="px-5 pb-5">
            {status?.last_event ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${status.status === "healthy" ? "status-dot-green" : "status-dot-red"}`} />
                  <span className="text-sm font-medium capitalize text-foreground">{status.status}</span>
                </div>
                <p className="text-caption">
                  Last activity: {new Date(status.last_event).toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
                    <div className="text-lg font-bold text-foreground">{status.open_tasks}</div>
                    <div className="text-label">Open</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
                    <div className="text-lg font-bold text-red-400">{status.blocked_tasks}</div>
                    <div className="text-label">Blocked</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
                    <div className="text-lg font-bold text-primary">{status.active_agents}</div>
                    <div className="text-label">Active</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-4 text-caption">No system activity recorded</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
