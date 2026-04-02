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
  Loader2,
  AlertTriangle,
  RefreshCw,
  Monitor,
  Clock,
  Activity,
  Bot,
  CheckCircle2,
} from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { deriveAgentPresence, getPresenceConfig, type AgentPresence, type PresenceState } from "@/lib/data/presence";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent } from "@/types/dashboard";

function timeAgo(iso: string | null): string {
  if (!iso) return "away";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "active now";
  if (mins < 60) return `${mins}m ago`;
  return `away ${Math.floor(mins / 60)}h`;
}

export default function OfficePage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);

  async function load() {
    setLoading(true);
    const [a, t] = await Promise.all([getAgents(), getTasks()]);
    setAgents(a.data);
    setTasks(t.data);
    setLoading(false);
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks"], loadRef);
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <PageShell title="Office" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading office...
        </div>
      </PageShell>
    );
  }

  const activeAgents = agents.filter((a) => a.status === "active");
  const pausedAgents = agents.filter((a) => a.status === "paused");

  return (
    <PageShell title="Digital Office" description="View each agent working — status, work areas, and real-time activity">
      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>At Work</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "var(--success)" }}>{activeAgents.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Away</p>
          <p className="text-2xl font-bold mt-1" style={{ color: pausedAgents.length > 0 ? "var(--warning)" : "var(--text-quiet)" }}>{pausedAgents.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Total Staff</p>
          <p className="text-2xl font-bold mt-1">{agents.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Active Tasks</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>{tasks.filter((t) => t.status !== "done").length}</p>
        </div>
      </div>

      {/* Office grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => {
          const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
          const openTasks = agentTasks.filter((t) => t.status !== "done");
          const blockedTasks = agentTasks.filter((t) => t.status === "blocked");
          const isWorking = agent.status === "active" && agent.last_activity;

          return (
            <Link key={agent.id} href={`/agents/${agent.id}`}>
              <Card className={`surface-card-hover cursor-pointer ${agent.status === "paused" ? "opacity-60" : ""}`}>
                <CardContent className="p-5">
                  {/* Agent avatar + status */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl" style={{ background: "var(--surface-muted)" }}>
                        {agent.emoji}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 ${isWorking ? "dot-green" : agent.status === "paused" ? "dot-amber" : "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{agent.name}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                    </div>
                  </div>

                  {/* Work area */}
                  <div className="rounded-lg p-3 mb-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Monitor className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Work Area</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{openTasks.length}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Open</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: blockedTasks.length > 0 ? "var(--danger)" : "var(--text)" }}>{blockedTasks.length}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Blocked</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--success)" }}>{agentTasks.filter((t) => t.status === "done").length}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Done</p>
                      </div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: isWorking ? "var(--success)" : "var(--text-quiet)" }}>
                      {isWorking ? "● Working" : agent.status === "paused" ? "⏸ Paused" : "○ Idle"}
                    </span>
                    <span style={{ color: "var(--text-quiet)" }}>
                      {timeAgo(agent.last_activity)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
