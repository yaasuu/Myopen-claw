"use client";

import { useEffect, useState } from "react";
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
import { Bot, CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw, Bell } from "lucide-react";
import { getSystemStatus } from "@/lib/data/system";
import { getTaskStats, getBlockedTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { getPausedAgents } from "@/lib/data/alerts";
import type { SystemStatus, TaskWithAgent, FeedEvent, Agent } from "@/types/dashboard";

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [taskStats, setTaskStats] = useState({ total: 0, pending: 0, inProgress: 0, blocked: 0, done: 0 });
  const [blocked, setBlocked] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sResult, stats, bResult, eResult, pausedResult] = await Promise.all([
        getSystemStatus(),
        getTaskStats(),
        getBlockedTasks(),
        getFeedEvents(4),
        getPausedAgents(),
      ]);

      const errors = [sResult.error, bResult.error, eResult.error, pausedResult.error].filter(Boolean);
      if (errors.length > 0) {
        setError(errors.join("; "));
      }

      setStatus(sResult.data);
      setTaskStats(stats);
      setBlocked(bResult.data);
      setEvents(eResult.data);
      setPausedAgents(pausedResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

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

  const summaryCards = [
    {
      title: "Active Agents",
      value: String(status?.active_agents ?? 0),
      icon: Bot,
      description: status?.active_agents ? "Operational" : "None active",
    },
    {
      title: "Open Tasks",
      value: String(taskStats.total - taskStats.done),
      icon: Clock,
      description: `${taskStats.inProgress} in progress`,
    },
    {
      title: "Blocked",
      value: String(taskStats.blocked),
      icon: AlertTriangle,
      description: taskStats.blocked > 0 ? "Needs attention" : "All clear",
    },
    {
      title: "Completed",
      value: String(taskStats.done),
      icon: CheckCircle2,
      description: `${taskStats.total} total tasks`,
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(taskStats.blocked > 0 || pausedAgents.length > 0) && (
        <Link href="/alerts">
          <Card className="border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-3 py-4">
              <Bell className="h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">Open Alerts</p>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span>{event.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Blocked Items</CardTitle>
          </CardHeader>
          <CardContent>
            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked items — all clear</p>
            ) : (
              <div className="space-y-3">
                {blocked.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-md border p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {task.title}
                        {task.assigned_agent_name && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            — {task.assigned_agent_emoji} {task.assigned_agent_name}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{task.blocker}</p>
                    </div>
                    <Badge variant="destructive">{task.priority}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
