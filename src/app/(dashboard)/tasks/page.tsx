"use client";

import * as React from "react";
import { useState, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { getTasks, createTask, updateTaskStatus, unblockTask } from "@/lib/data/tasks";
import { getAgents } from "@/lib/data/agents";
import type { TaskWithAgent, Agent } from "@/types/dashboard";

const statusColors: Record<string, string> = {
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

const STATUSES: TaskWithAgent["status"][] = ["pending", "in-progress", "blocked", "done"];
const PRIORITIES: TaskWithAgent["priority"][] = ["high", "medium", "low"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState<TaskWithAgent["status"]>("pending");
  const [newPriority, setNewPriority] = useState<TaskWithAgent["priority"]>("medium");
  const [newAgentId, setNewAgentId] = useState<string>("none");

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tasksResult, agentsResult] = await Promise.all([getTasks(), getAgents()]);
      if (tasksResult.error) setError(tasksResult.error);
      setTasks(tasksResult.data);
      setAgents(agentsResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const result = await createTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        status: newStatus,
        priority: newPriority,
        assigned_agent_id: newAgentId === "none" ? null : newAgentId,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setCreateOpen(false);
        setNewTitle("");
        setNewDesc("");
        setNewStatus("pending");
        setNewPriority("medium");
        setNewAgentId("none");
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(taskId: string, newStatusVal: string) {
    setUpdatingId(taskId);
    try {
      const result = await updateTaskStatus(taskId, newStatusVal as TaskWithAgent["status"]);
      if (result.error) {
        setError(result.error);
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: newStatusVal as TaskWithAgent["status"], updated_at: new Date().toISOString() }
              : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleUnblock(taskId: string) {
    setUpdatingId(taskId);
    try {
      const result = await unblockTask(taskId, "pending");
      if (result.error) {
        setError(result.error);
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, status: "pending" as const, blocker: null, updated_at: new Date().toISOString() }
              : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unblock task");
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAgent !== "all" && t.assigned_agent_id !== filterAgent) return false;
    return true;
  });

  if (loading) {
    return (
      <PageShell title="Tasks" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tasks...
        </div>
      </PageShell>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <PageShell title="Tasks" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load tasks</p>
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
      title="Tasks"
      description="Manage and track all work items"
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </div>
      )}

      {/* Top bar: filters + new task */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Task title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Optional description"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={newStatus} onValueChange={(v) => setNewStatus(v as TaskWithAgent["status"])}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority</label>
                  <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TaskWithAgent["priority"])}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Assign to Agent</label>
                <Select value={newAgentId} onValueChange={setNewAgentId}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.emoji} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Task count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} task{filtered.length !== 1 ? "s" : ""}
        {filterStatus !== "all" || filterAgent !== "all" ? ` (filtered from ${tasks.length})` : ""}
      </p>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {tasks.length === 0 ? "No tasks yet — create one to get started" : "No tasks match the current filters"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-20">Priority</TableHead>
                  <TableHead className="w-48">Agent</TableHead>
                  <TableHead className="w-24">Owner</TableHead>
                  <TableHead className="w-32">Updated</TableHead>
                  <TableHead>Blocker</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Select
                        value={task.status}
                        onValueChange={(v) => handleStatusChange(task.id, v)}
                        disabled={updatingId === task.id}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s]}`}>
                                {s}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {task.assigned_agent_name ? (
                        <span>
                          {task.assigned_agent_emoji} {task.assigned_agent_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{task.owner}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(task.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {task.blocker ? (
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            {task.blocker}
                          </span>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleUnblock(task.id)}
                            disabled={updatingId === task.id}
                          >
                            Unblock
                          </Button>
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
    </PageShell>
  );
}
