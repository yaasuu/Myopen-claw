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
  AlertTriangle,
  Bell,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Bot,
  ArrowRight,
  Clock,
  TrendingDown,
} from "lucide-react";
import { getBlockedTasks, getTasks } from "@/lib/data/tasks";
import { getCriticalFeedEvents } from "@/lib/data/feed";
import { getPausedAgents } from "@/lib/data/alerts";
import { getSystemStatus } from "@/lib/data/system";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { TaskWithAgent, FeedEvent, Agent, SystemStatus } from "@/types/dashboard";
import { timeAgo } from "@/lib/utils";

const DRIFT_HOURS = 48;

const prioritySeverity: Record<string, { label: string; color: string; dot: string }> = {
  high: { label: "High", color: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)] border-red-200", dot: "dot-red" },
  medium: { label: "Medium", color: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)] border-amber-200", dot: "dot-amber" },
  low: { label: "Low", color: "bg-transparent text-[var(--text-muted)] border-[var(--border)]", dot: "bg-gray-400" },
};

export default function AlertsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [blocked, setBlocked] = useState<TaskWithAgent[]>([]);
  const [driftTasks, setDriftTasks] = useState<TaskWithAgent[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [blockedResult, eventsResult, pausedResult, statusResult, allTasksResult] = await Promise.all([
        getBlockedTasks(),
        getCriticalFeedEvents(10),
        getPausedAgents(),
        getSystemStatus(),
        getTasks({ includeArchived: false }),
      ]);

      const errors = [blockedResult.error, eventsResult.error, pausedResult.error, statusResult.error].filter(Boolean);
      if (errors.length > 0) setError(errors.join("; "));

      setBlocked(blockedResult.data);
      setCriticalEvents(eventsResult.data);
      setPausedAgents(pausedResult.data);
      setSystemStatus(statusResult.data);

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
    <PageShell
      title="Alerts"
      description="Blockers, critical events, and system warnings"
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          Some data may be stale: {error}
        </div>
      )}

      {/* Alert summary bar */}
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          {totalAlerts === 0
            ? "All clear — no active alerts"
            : `${totalAlerts} active alert${totalAlerts !== 1 ? "s" : ""}`}
        </span>
        {totalAlerts > 0 && <Badge variant="destructive">{totalAlerts}</Badge>}
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
    </PageShell>
  );
}
