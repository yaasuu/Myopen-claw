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
import { Activity, Clock, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import type { Agent } from "@/types/dashboard";

const statusColor: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  retired: "bg-gray-400",
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
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load agents</p>
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
      title="Agents"
      description="Specialist agents in the Yas Claw system"
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Some data may be stale: {error}
        </div>
      )}

      {agents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No agents configured
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`} className="block">
              <Card className="transition-colors hover:border-primary/40 cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-lg">{agent.emoji}</span>
                    {agent.name}
                  </CardTitle>
                  <Badge variant="outline" className="gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusColor[agent.status]}`} />
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{agent.domain}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{timeAgo(agent.last_activity)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    <span>{agent.task_count} tasks</span>
                  </div>
                </div>
              </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
