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

function StatusIcon({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="icon-box" style={{ background: `${color}12` }}>
      {children}
    </div>
  );
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
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading dashboard...
        </div>
      </PageShell>
    );
  }

  if (error && !status) {
    return (
      <PageShell title="Overview" description="Error loading data">
        <div className="surface-card">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load dashboard</p>
              <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{error}</p>
            </div>
            <button onClick={load} className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </div>
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
      color: "var(--accent)",
    },
    {
      label: "Open Tasks",
      value: String(taskStats.total - taskStats.done),
      sub: `${taskStats.inProgress} in progress`,
      icon: TrendingUp,
      color: "var(--info)",
    },
    {
      label: "Blocked",
      value: String(taskStats.blocked),
      sub: taskStats.blocked > 0 ? "Needs attention" : "All clear",
      icon: AlertTriangle,
      color: taskStats.blocked > 0 ? "var(--danger)" : "var(--text-quiet)",
    },
    {
      label: "Completed",
      value: String(taskStats.done),
      sub: `${taskStats.total} total`,
      icon: CheckCircle2,
      color: "var(--success)",
    },
  ];

  return (
    <PageShell title="Overview" description="Operating summary">
      {error && (
        <div
          className="rounded-lg border px-4 py-2.5 text-xs"
          style={{ borderColor: "rgba(245, 158, 11, 0.2)", background: "rgba(245, 158, 11, 0.06)", color: "var(--warning)" }}
        >
          Some data may be stale: {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="surface-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>
                {card.label}
              </span>
              <StatusIcon color={card.color}>
                <card.icon className="h-4 w-4" style={{ color: card.color }} />
              </StatusIcon>
            </div>
            <div className="text-2xl font-bold tracking-tight tabular-nums" style={{ color: card.color }}>
              {card.value}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Attention needed */}
      {needsAttention && (
        <Link href="/alerts" className="block">
          <div className="surface-card border-critical hover:border-warning transition-colors cursor-pointer">
            <div className="flex items-center gap-4 p-4">
              <div className="icon-box" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
                <Bell className="h-4 w-4" style={{ color: "var(--warning)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--warning)" }}>Attention Needed</p>
                <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                  {taskStats.blocked > 0 && `${taskStats.blocked} blocked task${taskStats.blocked !== 1 ? "s" : ""}`}
                  {taskStats.blocked > 0 && pausedAgents.length > 0 && " · "}
                  {pausedAgents.length > 0 && `${pausedAgents.length} paused agent${pausedAgents.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Badge style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--warning)" }}>
                {taskStats.blocked + pausedAgents.length}
              </Badge>
              <ArrowRight className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
            </div>
          </div>
        </Link>
      )}

      {/* Three-column signal row */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Blocked tasks */}
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="icon-box-sm" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
                  <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Blocked Tasks</span>
              </div>
              {blocked.length > 0 && (
                <Badge style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger)" }}>{blocked.length}</Badge>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {blocked.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                All clear
              </div>
            ) : (
              <div className="space-y-2.5">
                {blocked.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-lg p-3 space-y-1.5" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-quiet)" }}>{task.blocker}</p>
                    {task.assigned_agent_name && (
                      <Link href={`/agents/${task.assigned_agent_id}`} className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
                        {task.assigned_agent_emoji} {task.assigned_agent_name}
                      </Link>
                    )}
                  </div>
                ))}
                {blocked.length > 3 && (
                  <Link href="/alerts" className="text-xs hover:underline block text-center pt-1 font-medium" style={{ color: "var(--accent)" }}>
                    View all {blocked.length} blocked →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Paused agents */}
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="icon-box-sm" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
                  <Bot className="h-3.5 w-3.5" style={{ color: "var(--warning)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Paused Agents</span>
              </div>
              {pausedAgents.length > 0 && (
                <Badge style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--warning)" }}>{pausedAgents.length}</Badge>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {pausedAgents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                All agents active
              </div>
            ) : (
              <div className="space-y-2.5">
                {pausedAgents.map((agent) => (
                  <Link key={agent.id} href={`/agents/${agent.id}`} className="block rounded-lg p-3 hover-surface transition-colors" style={{ border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{agent.name}</p>
                        <p className="text-xs truncate" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-quiet)" }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Critical events */}
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="icon-box-sm" style={{ background: "rgba(59, 130, 246, 0.08)" }}>
                  <ShieldAlert className="h-3.5 w-3.5" style={{ color: "var(--info)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Critical Events</span>
              </div>
              {criticalEvents.length > 0 && (
                <Link href="/alerts">
                  <Badge className="cursor-pointer hover:opacity-80 transition-opacity" style={{ background: "rgba(59, 130, 246, 0.12)", color: "var(--info)" }}>
                    {criticalEvents.length}
                  </Badge>
                </Link>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {criticalEvents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                No critical events
              </div>
            ) : (
              <div className="space-y-2.5">
                {criticalEvents.map((event) => (
                  <div key={event.id} className="rounded-lg p-3 space-y-1" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <p className="text-sm truncate" style={{ color: "var(--text)" }}>{event.summary}</p>
                    <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p>
                  </div>
                ))}
                <Link href="/alerts" className="text-xs hover:underline block text-center pt-1 font-medium" style={{ color: "var(--accent)" }}>
                  View all alerts →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity + System */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="icon-box-sm" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                <Activity className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Recent Activity</span>
            </div>
          </div>
          <div className="px-5 pb-5">
            {events.length === 0 ? (
              <p className="py-4 text-xs" style={{ color: "var(--text-quiet)" }}>No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="w-14 shrink-0 text-xs font-medium tabular-nums" style={{ color: "var(--text-quiet)" }}>
                      {timeAgo(event.created_at)}
                    </span>
                    <span className="flex-1" style={{ color: "var(--text-muted)" }}>{event.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="icon-box-sm" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>System Status</span>
            </div>
          </div>
          <div className="px-5 pb-5">
            {status?.last_event ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${status.status === "healthy" ? "dot-green" : "dot-red"}`} />
                  <span className="text-sm font-medium capitalize" style={{ color: "var(--text)" }}>{status.status}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                  Last activity: {new Date(status.last_event).toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--text)" }}>{status.open_tasks}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Open</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--danger)" }}>{status.blocked_tasks}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Blocked</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>{status.active_agents}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Active</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-4 text-xs" style={{ color: "var(--text-quiet)" }}>No system activity recorded</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
