"use client";

import React, { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTasks } from "@/lib/data/tasks";
import { getAgents } from "@/lib/data/agents";
import { getSystemStatus } from "@/lib/data/system";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { TaskWithAgent, Agent, SystemStatus } from "@/types/dashboard";
import {
  Bot,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  Radio,
  FileText,
  Zap,
} from "lucide-react";

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

export default function HermesPage() {
  const [dispatched, setDispatched] = useState<TaskWithAgent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [tasksResult, agentsResult, statusResult] = await Promise.all([
      getTasks({ includeArchived: false }),
      getAgents(),
      getSystemStatus(),
    ]);
    setDispatched(
      tasksResult.data.filter(
        (t) => t.owner_agent_id || t.status === "dispatched" || t.status === "in-progress"
      )
    );
    setAgents(agentsResult.data);
    if (!statusResult.error) setSystemStatus(statusResult.data);
    setLoading(false);
  }, []);

  useRealtime("tasks", load);
  useRealtime("system_status", load);

  useEffect(() => {
    load();
  }, [load]);

  const statusConfig = {
    healthy:  { label: "Healthy",  dot: "dot-green", color: "var(--success)", bg: "rgba(16,185,129,0.08)" },
    degraded: { label: "Degraded", dot: "dot-amber", color: "var(--warning)", bg: "rgba(245,158,11,0.08)" },
    down:     { label: "Down",     dot: "dot-red",   color: "var(--danger)",  bg: "rgba(239,68,68,0.08)" },
  };
  const s = statusConfig[systemStatus?.status ?? "healthy"];

  const byAgent = agents
    .map((agent) => ({
      agent,
      tasks: dispatched.filter(
        (t) => t.owner_agent_id === agent.id || t.assigned_agent_id === agent.id
      ),
    }))
    .filter((row) => row.tasks.length > 0);

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Send className="h-6 w-6" style={{ color: "var(--accent)" }} />
            Hermes Orchestrator
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Dispatch queue · agent routing · system health
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
             style={{ borderColor: s.color + "40", background: s.bg }}>
          <span className="relative flex h-2 w-2">
            {systemStatus?.status === "healthy" && (
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: s.color }} />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: s.color }} />
          </span>
          <span className="text-xs font-semibold" style={{ color: s.color }}>
            {s.label}
          </span>
          {systemStatus?.last_event && (
            <span className="text-[10px] truncate max-w-[160px]" style={{ color: "var(--text-quiet)" }}>
              · {timeAgo(systemStatus.last_event)}
            </span>
          )}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active Agents",  val: systemStatus?.active_agents ?? agents.length,                          sub: "online",            icon: Bot,      color: "var(--accent)",  bg: "var(--accent-soft)" },
          { label: "In Progress",    val: dispatched.filter((t) => t.status === "in-progress").length,            sub: "executing",         icon: Zap,      color: "var(--info)",    bg: "rgba(37,99,235,0.08)" },
          { label: "In Dispatch",    val: dispatched.filter((t) => t.status === "dispatched").length,             sub: "awaiting pickup",   icon: Send,     color: "var(--warning)", bg: "rgba(245,158,11,0.08)" },
          { label: "Pending Review", val: dispatched.filter((t) => t.status === "in-review" || t.status === "submitted").length, sub: "needs Yas",         icon: FileText, color: "var(--success)", bg: "rgba(16,185,129,0.08)" },
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
            {loading ? (
              <div className="px-4 pb-4 text-xs" style={{ color: "var(--text-quiet)" }}>Loading…</div>
            ) : dispatched.length === 0 ? (
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

        {/* Agent queue view */}
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

      {/* Integration reference */}
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
    </PageShell>
  );
}
