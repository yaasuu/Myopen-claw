"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Loader2,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  LayoutGrid,
  List,
  Clock,
} from "lucide-react";
import {
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  unblockTask,
  updateTaskAssignment,
  archiveTask,
  unarchiveTask,
} from "@/lib/data/tasks";
import { getAgents } from "@/lib/data/agents";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { TaskWithAgent, Agent } from "@/types/dashboard";

const statusColors: Record<string, string> = {
  pending: "bg-transparent text-[var(--text-quiet)] border-[var(--border)]",
  "in-progress": "bg-[rgba(59,130,246,0.08)] text-[var(--info)] border-blue-200",
  blocked: "bg-[rgba(239,68,68,0.08)] text-[var(--danger)] border-red-200",
  done: "bg-[rgba(16,185,129,0.08)] text-[var(--success)] border-emerald-200",
};

const priorityColors: Record<string, { text: string; dot: string }> = {
  high: { text: "text-[var(--danger)]", dot: "bg-[rgba(239,68,68,0.08)]0" },
  medium: { text: "text-[var(--warning)]", dot: "bg-[rgba(245,158,11,0.08)]0" },
  low: { text: "text-[var(--text-quiet)]", dot: "bg-gray-400" },
};

const STATUSES: TaskWithAgent["status"][] = ["pending", "in-progress", "blocked", "done"];

const priorityBadgeStyle: Record<string, React.CSSProperties> = {
  high: { background: "rgba(220,38,38,0.08)", color: "#dc2626" },
  medium: { background: "rgba(217,119,6,0.08)", color: "#d97706" },
  low: { background: "rgba(22,163,74,0.08)", color: "#16a34a" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
const PRIORITIES: TaskWithAgent["priority"][] = ["high", "medium", "low"];

export default function TasksPage() {
  const canWrite = useCanWrite();
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState<TaskWithAgent["status"]>("pending");
  const [newPriority, setNewPriority] = useState<TaskWithAgent["priority"]>("medium");
  const [newAgentId, setNewAgentId] = useState<string>("none");
  const [newBlocker, setNewBlocker] = useState("");
  const [newOwner, setNewOwner] = useState("Yas");
  const [createSuccess, setCreateSuccess] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTask, setEditTask] = useState<TaskWithAgent | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatus, setEditStatus] = useState<TaskWithAgent["status"]>("pending");
  const [editPriority, setEditPriority] = useState<TaskWithAgent["priority"]>("medium");
  const [editAgentId, setEditAgentId] = useState<string>("none");
  const [editBlocker, setEditBlocker] = useState("");
  const [editOwner, setEditOwner] = useState("");

  // Inline updates
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tasksResult, agentsResult] = await Promise.all([
        getTasks({ includeArchived: showArchived }),
        getAgents(),
      ]);
      if (tasksResult.error) setError(tasksResult.error);
      setTasks(tasksResult.data);
      setAgents(agentsResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [showArchived]);
  useRealtimeMulti(["tasks", "agents", "feed_events"], loadRef);

  useEffect(() => {
    load();
  }, [showArchived]);

  // ── Create ──────────────────────────────────────────
  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        status: newStatus,
        priority: newPriority,
        assigned_agent_id: newAgentId === "none" ? null : newAgentId,
        blocker: newBlocker.trim() || null,
        owner: newOwner.trim() || "Yas",
      });
      if (result.error) {
        setError(result.error);
      } else {
        setCreateSuccess(true);
        setTimeout(() => {
          setCreateOpen(false);
          setCreateSuccess(false);
          setNewTitle("");
          setNewDesc("");
          setNewStatus("pending");
          setNewPriority("medium");
          setNewAgentId("none");
          setNewBlocker("");
          setNewOwner("Yas");
        }, 800);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  // ── Edit ────────────────────────────────────────────
  function openEdit(task: TaskWithAgent) {
    setEditTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditAgentId(task.assigned_agent_id ?? "none");
    setEditBlocker(task.blocker ?? "");
    setEditOwner(task.owner);
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!editTask || !editTitle.trim()) return;
    setEditing(true);
    setError(null);
    try {
      // If blocker was cleared and status is still blocked, move to pending
      const blockerCleared = editTask.blocker && !editBlocker.trim();
      const finalStatus = blockerCleared && editStatus === "blocked" ? "pending" : editStatus;

      const result = await updateTask(editTask.id, {
        title: editTitle.trim(),
        description: editDesc.trim(),
        status: finalStatus,
        priority: editPriority,
        assigned_agent_id: editAgentId === "none" ? null : editAgentId,
        blocker: editBlocker.trim() || null,
        owner: editOwner.trim() || "Yas",
      });

      if (result.error) {
        setError(result.error);
      } else {
        // If blocker was resolved, log the feed event
        if (blockerCleared && editTask.blocker) {
          await unblockTask(editTask.id, finalStatus);
        }
        setEditOpen(false);
        setEditTask(null);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setEditing(false);
    }
  }

  // ── Inline status change ────────────────────────────
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

  // ── Unblock ─────────────────────────────────────────
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

  // ── Reassign ────────────────────────────────────────
  async function handleReassign(taskId: string, agentId: string | null) {
    setUpdatingId(taskId);
    try {
      const result = await updateTaskAssignment(taskId, agentId);
      if (result.error) {
        setError(result.error);
      } else {
        const agent = agentId ? agents.find((a) => a.id === agentId) : null;
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  assigned_agent_id: agentId,
                  assigned_agent_name: agent?.name ?? null,
                  assigned_agent_emoji: agent?.emoji ?? null,
                  updated_at: new Date().toISOString(),
                }
              : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign task");
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Archive / Unarchive ─────────────────────────────
  async function handleArchive(taskId: string) {
    setUpdatingId(taskId);
    try {
      const result = await archiveTask(taskId);
      if (result.error) {
        setError(result.error);
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive task");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleUnarchive(taskId: string) {
    setUpdatingId(taskId);
    try {
      const result = await unarchiveTask(taskId);
      if (result.error) {
        setError(result.error);
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, is_archived: false, updated_at: new Date().toISOString() }
              : t
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unarchive task");
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Derived ─────────────────────────────────────────
  const filtered = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAgent !== "all" && t.assigned_agent_id !== filterAgent) return false;
    return true;
  });

  // ── Loading state ───────────────────────────────────
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

  // ── Error state (no data) ───────────────────────────
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
            <button onClick={load} className="text-sm text-[var(--info)] hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Tasks" description="Manage and track all work items">
      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        {/* Left: view toggle (Board | List) */}
        <div className="flex items-center rounded-lg overflow-hidden" style={{ background: "var(--surface-muted)" }}>
          <button
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              background: viewMode === "board" ? "var(--text)" : "transparent",
              color: viewMode === "board" ? "var(--bg)" : "var(--text-muted)",
            }}
            onClick={() => setViewMode("board")}
          >
            Board
          </button>
          <button
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              background: viewMode === "table" ? "var(--text)" : "transparent",
              color: viewMode === "table" ? "var(--bg)" : "var(--text-muted)",
            }}
            onClick={() => setViewMode("table")}
          >
            List
          </button>
        </div>

        <div className="divider" />

        {/* Filters */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.emoji} {a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {/* Right: icon actions */}
        {canWrite && (
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            onClick={() => setCreateOpen(true)}
            title="New task"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}

        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
          style={{ borderColor: "var(--border)", color: showArchived ? "var(--accent)" : "var(--text-muted)" }}
          onClick={() => setShowArchived(!showArchived)}
          title={showArchived ? "Hide archived" : "Show archived"}
        >
          {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>

        <span className="text-xs ml-2" style={{ color: "var(--text-quiet)" }}>
          {filtered.length}
        </span>
      </div>
        <Dialog open={createOpen} onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateSuccess(false);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createSuccess ? "Task Created ✓" : "Create Task"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {createSuccess ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  <p className="text-sm font-medium text-[var(--success)]">Task created successfully</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Title *</label>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Owner</label>
                      <input
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Owner"
                        value={newOwner}
                        onChange={(e) => setNewOwner(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Blocker</label>
                      <input
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        placeholder="Optional blocker text"
                        value={newBlocker}
                        onChange={(e) => setNewBlocker(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="w-full">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create Task
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

      {/* Board View — matches Mission Control reference */}
      {viewMode === "board" && (
        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Left: Agent sidebar (like reference) */}
          <div className="hidden lg:flex w-[200px] shrink-0 flex-col rounded-xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Agents</p>
                <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>{agents.filter(a => a.status === "active").length} active</p>
              </div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {agents.map((agent) => {
                const agentTasks = filtered.filter((t) => t.assigned_agent_id === agent.id && t.status !== "done");
                return (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
                  >
                    <div className="relative">
                      <span className="text-base">{agent.emoji}</span>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border ${agent.status === "active" ? "dot-green" : "dot-amber"}`} style={{ borderColor: "var(--surface)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{agentTasks.length} tasks</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right: Kanban columns */}
          <div className="flex-1 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((status) => {
              const columnTasks = filtered.filter((t) => t.status === status);
              const dotColor: Record<string, string> = {
                pending: "dot-gray",
                "in-progress": "dot-blue",
                blocked: "dot-red",
                done: "dot-green",
              };
              const statusLabel: Record<string, string> = {
                pending: "Pending",
                "in-progress": "In Progress",
                blocked: "Blocked",
                done: "Done",
              };

              return (
                <div key={status} className="space-y-3">
                  {/* Column header */}
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${dotColor[status]}`} />
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{statusLabel[status]}</span>
                    <span className="text-[11px] font-medium" style={{ color: "var(--text-quiet)" }}>{columnTasks.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-[200px]">
                    {columnTasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed py-10 text-center text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
                        No tasks
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        return (
                          <div
                            key={task.id}
                            className={`group relative cursor-pointer rounded-lg border p-4 transition-all hover:-translate-y-0.5 ${task.is_archived ? "opacity-50" : ""} ${task.blocker ? "border-[rgba(220,38,38,0.3)]" : ""}`}
                            style={{
                              background: "var(--surface)",
                              borderColor: task.blocker ? undefined : "var(--border)",
                              boxShadow: "var(--shadow-card)",
                            }}
                            onClick={() => openEdit(task)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
                              if (!task.blocker) e.currentTarget.style.borderColor = "var(--border-strong)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = "var(--shadow-card)";
                              if (!task.blocker) e.currentTarget.style.borderColor = "var(--border)";
                            }}
                          >
                            {/* Left color bar for blocked */}
                            {task.blocker && (
                              <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg" style={{ background: "var(--danger)" }} />
                            )}

                            {/* Top: title + priority badge */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-2 flex-1">
                                <p className="text-sm font-medium line-clamp-2 break-words" style={{ color: "var(--text)" }}>
                                  {task.title}
                                </p>
                                {task.blocker && (
                                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--danger)" }}>
                                    <span className="h-1.5 w-1.5 rounded-full dot-red" />
                                    Blocked
                                  </div>
                                )}
                              </div>
                              <span
                                className="inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                                style={priorityBadgeStyle[task.priority]}
                              >
                                {task.priority.toUpperCase()}
                              </span>
                            </div>

                            {/* Bottom: assignee + time */}
                            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                              <div className="flex items-center gap-2">
                                {task.assigned_agent_emoji && <span className="text-sm">{task.assigned_agent_emoji}</span>}
                                <span>{task.assigned_agent_name ?? "Unassigned"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
                                <span>{timeAgo(task.updated_at)}</span>
                              </div>
                            </div>

                            {/* Quick done on hover */}
                            {canWrite && !task.is_archived && status !== "done" && (
                              <button
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded-md transition-opacity font-medium"
                                style={{ color: "var(--success)", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)" }}
                                onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "done"); }}
                                disabled={updatingId === task.id}
                                title="Mark done"
                              >
                                ✓ Done
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {tasks.length === 0
                ? showArchived
                  ? "No tasks found"
                  : "No tasks yet — create one to get started"
                : "No tasks match the current filters"}
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
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => (
                  <TableRow key={task.id} className={task.is_archived ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {task.title}
                        {task.is_archived && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            archived
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={task.status}
                        onValueChange={(v) => handleStatusChange(task.id, v)}
                        disabled={!canWrite || updatingId === task.id || task.is_archived}
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
                      <span className={`text-xs font-medium inline-flex items-center gap-1.5 ${priorityColors[task.priority].text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${priorityColors[task.priority].dot}`} />
                        {task.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Select
                        value={task.assigned_agent_id ?? "unassigned"}
                        onValueChange={(v) => handleReassign(task.id, v === "unassigned" ? null : v)}
                        disabled={!canWrite || updatingId === task.id || task.is_archived}
                      >
                        <SelectTrigger className="h-7 w-44 text-xs">
                          <SelectValue>
                            {task.assigned_agent_name ? (
                              <span>{task.assigned_agent_emoji} {task.assigned_agent_name}</span>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id} className="text-xs">
                              {a.emoji} {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{task.owner}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(task.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {task.blocker ? (
                        <span className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-[var(--danger)]">
                            <AlertTriangle className="h-3 w-3" />
                            {task.blocker}
                          </span>
                          {!task.is_archived && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleUnblock(task.id)}
                              disabled={!canWrite || updatingId === task.id}
                            >
                              Unblock
                            </Button>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canWrite && !task.is_archived && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(task)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleArchive(task.id)}>
                              <Archive className="mr-2 h-3.5 w-3.5" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {canWrite && task.is_archived && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleUnarchive(task.id)}>
                              <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                              Unarchive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      {/* Edit dialog */}
      {canWrite && (
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Task title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                placeholder="Optional description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as TaskWithAgent["status"])}>
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
                <Select value={editPriority} onValueChange={(v) => setEditPriority(v as TaskWithAgent["priority"])}>
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
              <Select value={editAgentId} onValueChange={setEditAgentId}>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Owner</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Owner"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Blocker</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Clear to resolve blocker"
                  value={editBlocker}
                  onChange={(e) => setEditBlocker(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleEditSave} disabled={editing || !editTitle.trim()} className="w-full">
              {editing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}
    </PageShell>
  );
}
