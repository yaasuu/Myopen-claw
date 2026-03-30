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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Bell,
  ShieldAlert,
  Clock,
  Loader2,
  RefreshCw,
  Bot,
  ArrowRight,
} from "lucide-react";
import { getBlockedTasks } from "@/lib/data/tasks";
import { getCriticalFeedEvents } from "@/lib/data/feed";
import { getPausedAgents } from "@/lib/data/alerts";
import { getSystemStatus } from "@/lib/data/system";
import type { TaskWithAgent, FeedEvent, Agent, SystemStatus } from "@/types/dashboard";

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-700",
};

const eventBadgeColors: Record<string, string> = {
  blocker_detected: "bg-red-100 text-red-700",
  system_alert: "bg-orange-100 text-orange-700",
  agent_paused: "bg-yellow-100 text-yellow-700",
};

export default function AlertsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [blocked, setBlocked] = useState<TaskWithAgent[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [blockedResult, eventsResult, pausedResult, statusResult] = await Promise.all([
        getBlockedTasks(),
        getCriticalFeedEvents(15),
        getPausedAgents(),
        getSystemStatus(),
      ]);

      const errors = [blockedResult.error, eventsResult.error, pausedResult.error, statusResult.error].filter(Boolean);
      if (errors.length > 0) setError(errors.join("; "));

      setBlocked(blockedResult.data);
      setCriticalEvents(eventsResult.data);
      setPausedAgents(pausedResult.data);
      setSystemStatus(statusResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalAlerts = blocked.length + pausedAgents.length + (systemStatus && systemStatus.status !== "healthy" ? 1 : 0);

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
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load alerts</p>
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

  return (
    <PageShell
      title="Alerts"
      description="Blockers, critical events, and system warnings"
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Some data may be stale: {error}
        </div>
      )}

      {/* Alert summary */}
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          {totalAlerts === 0
            ? "All clear — no active alerts"
            : `${totalAlerts} active alert${totalAlerts !== 1 ? "s" : ""}`}
        </span>
        {totalAlerts > 0 && <Badge variant="destructive">{totalAlerts}</Badge>}
      </div>

      {/* Section 1: Active Blockers */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold">Active Blockers</h2>
          {blocked.length > 0 && <Badge variant="destructive" className="text-xs">{blocked.length}</Badge>}
        </div>

        <Card>
          <CardContent className="p-0">
            {blocked.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No blocked tasks — all work is moving
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead className="w-24">Priority</TableHead>
                    <TableHead className="w-40">Agent</TableHead>
                    <TableHead>Blocker</TableHead>
                    <TableHead className="w-28">Updated</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocked.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[task.priority]}`}>
                          {task.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {task.assigned_agent_name ? (
                          <span>{task.assigned_agent_emoji} {task.assigned_agent_name}</span>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {task.blocker ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(task.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Link href="/tasks">
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 2: Recent Critical Events */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold">Recent Critical Events</h2>
          {criticalEvents.length > 0 && <Badge className="bg-orange-100 text-orange-700 text-xs">{criticalEvents.length}</Badge>}
        </div>

        <Card>
          <CardContent className="p-0">
            {criticalEvents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No critical events recorded
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Type</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-28">Source</TableHead>
                    <TableHead className="w-36">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criticalEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${eventBadgeColors[event.event_type] ?? "bg-gray-100 text-gray-700"}`}>
                          {event.event_type.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{event.summary}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{event.source}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 3: System / Agent Warnings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-yellow-500" />
          <h2 className="text-sm font-semibold">System &amp; Agent Warnings</h2>
          {pausedAgents.length > 0 && <Badge className="bg-yellow-100 text-yellow-700 text-xs">{pausedAgents.length}</Badge>}
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {/* System status warning */}
            {systemStatus && systemStatus.status !== "healthy" && (
              <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-800">System Status: {systemStatus.status}</p>
                  <p className="text-xs text-red-600">
                    {systemStatus.blocked_tasks} blocked tasks · {systemStatus.open_tasks} open tasks
                  </p>
                </div>
              </div>
            )}

            {/* Paused agents */}
            {pausedAgents.length > 0 ? (
              <div className="space-y-2">
                {pausedAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-3 rounded-md border p-3">
                    <span className="text-lg">{agent.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.domain}</p>
                    </div>
                    <Badge className="bg-yellow-100 text-yellow-700">Paused</Badge>
                    <Link href={`/agents/${agent.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}

            {/* All clear */}
            {pausedAgents.length === 0 && (!systemStatus || systemStatus.status === "healthy") && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No active warnings — all agents operational, system healthy
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
