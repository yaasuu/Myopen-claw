"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { useRealtime } from "@/lib/realtime/use-realtime";
import type { Agent } from "@/types/dashboard";

const statusColor: Record<string, string> = {
  active: "dot-green",
  paused: "dot-amber",
  retired: "dot-gray",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getAgents();
      setAgents(result.data);
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtime("agents", loadRef);

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <PageShell title="Agents" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agents...
        </div>
      </PageShell>
    );
  }

  if (error && agents.length === 0) {
    return (
      <PageShell title="Agents" description="Error loading data">
        <div className="surface-card">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load agents</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{error}</p>
            </div>
            <button onClick={load} className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Agents"
      description="Specialist agents in the Yas Claw system"
    >
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245, 158, 11, 0.2)", background: "rgba(245, 158, 11, 0.06)", color: "var(--warning)" }}>
          Some data may be stale: {error}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="surface-card">
          <CardContent className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No agents configured
          </CardContent>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`} className="block">
              <div className="surface-card-hover p-5 space-y-3 cursor-pointer h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{agent.emoji}</span>
                    <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{agent.name}</span>
                  </div>
                  <Badge variant="outline" className="gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusColor[agent.status]}`} />
                    {agent.status}
                  </Badge>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{agent.domain}</p>
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-quiet)" }}>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{timeAgo(agent.last_activity)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    <span>{agent.task_count} tasks</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
