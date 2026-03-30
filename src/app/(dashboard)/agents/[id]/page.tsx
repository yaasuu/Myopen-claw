"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Play,
  Pause,
  Clock,
  Activity,
} from "lucide-react";
import { getAgentById, updateAgentStatus } from "@/lib/data/agents";
import { getTasksByAgent } from "@/lib/data/tasks";
import type { Agent, TaskWithAgent } from "@/types/dashboard";

const statusColor: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  retired: "bg-gray-400",
};

const taskStatusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  "in-progress": "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-emerald-100 text-emerald-700",
};

const priorityColors: Record<string, string> = {
  high: "text-red-600",
  medium: "text-amber-600",
  low: "text-gray-500",
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

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agentResult, tasksResult] = await Promise.all([
        getAgentById(agentId),
        getTasksByAgent(agentId),
      ]);
      if (agentResult.error) {
        setError(agentResult.error);
      } else if (!agentResult.data) {
        setError("Agent not found");
      } else {
        setAgent(agentResult.data);
      }
      if (tasksResult.error && !tasksResult.error.includes("not connected")) {
        setError(tasksResult.error);
      }
      setTasks(tasksResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [agentId]);

  async function handleToggleStatus() {
    if (!agent || agent.status === "retired") return;
    const newStatus = agent.status === "active" ? "paused" : "active";
    setToggling(true);
    try {
      const result = await updateAgentStatus(agent.id, newStatus);
      if (result.error) {
        setError(result.error);
      } else {
        setAgent((prev) => (prev ? { ...prev, status: newStatus } : prev));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent status");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="Agent" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agent...
        </div>
      </PageShell>
    );
  }

  if (error && !agent) {
    return (
      <PageShell title="Agent" description="Error">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load agent</p>
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

  if (!agent) return null;

  const canToggle = agent.status !== "retired";

  return (
    <PageShell
      title={`${agent.emoji} ${agent.name}`}
      description={agent.domain}
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </div>
      )}

      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1.5 w-fit" onClick={() => router.push("/agents")}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Agents
      </Button>

      {/* Agent info card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="text-2xl">{agent.emoji}</span>
              <div>
                <div>{agent.name}</div>
                <div className="text-xs font-normal text-muted-foreground">{agent.short_id}</div>
              </div>
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${statusColor[agent.status]}`} />
                {agent.status}
              </Badge>
              {canToggle && (
                <Button
                  variant={agent.status === "active" ? "outline" : "default"}
                  size="sm"
                  className="gap-1.5"
                  onClick={handleToggleStatus}
                  disabled={toggling}
                >
                  {toggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : agent.status === "active" ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{agent.description}</p>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>{agent.task_count} tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Last activity: {timeAgo(agent.last_activity)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Tasks */}
      <div>
        <h2 className="text-sm font-medium mb-3">Assigned Tasks</h2>
        <Card>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No tasks assigned to this agent
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-20">Priority</TableHead>
                    <TableHead className="w-32">Updated</TableHead>
                    <TableHead>Blocker</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${taskStatusColors[task.status]}`}>
                          {task.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${priorityColors[task.priority]}`}>
                          {task.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(task.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {task.blocker ? (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            {task.blocker}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
