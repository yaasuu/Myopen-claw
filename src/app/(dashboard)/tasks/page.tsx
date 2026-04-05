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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  Repeat,
  Calendar,
  Zap,
  Eye,
  UserCheck,
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
  getGoals,
} from "@/lib/data/tasks";
import { getAgents } from "@/lib/data/agents";
import { getTaskComments, addTaskComment } from "@/lib/data/comments";
import { getTaskReviews, submitReview } from "@/lib/data/reviews";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { TaskWithAgent, Agent, TaskComment, Goal } from "@/types/dashboard";
import { EmptyState } from "@/components/ui/empty-state";

const statusColors: Record<string, string> = {
  pending: "bg-transparent text-[var(--text-quiet)] border-[var(--border)]",
  "in-progress": "bg-[rgba(59,130,246,0.08)] text-[var(--info)] border-blue-200",
  blocked: "bg-[rgba(239,68,68,0.08)] text-[var(--danger)] border-red-200",
  "in-review": "bg-[rgba(139,92,246,0.08)] text-violet-600 border-violet-200",
  done: "bg-[rgba(16,185,129,0.08)] text-[var(--success)] border-emerald-200",
};

const priorityColors: Record<string, { text: string; dot: string }> = {
  high: { text: "text-[var(--danger)]", dot: "dot-red" },
  medium: { text: "text-[var(--warning)]", dot: "dot-amber" },
  low: { text: "text-[var(--text-quiet)]", dot: "bg-gray-400" },
};

const STATUSES: TaskWithAgent["status"][] = ["pending", "in-progress", "blocked", "in-review", "done"];
const BOARD_COLUMNS: TaskWithAgent["status"][] = ["pending", "in-progress", "in-review", "done"];

// Transition rules: from → allowed to
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["in-progress"],
  "in-progress": ["blocked", "in-review"],
  blocked: ["in-progress"],
  "in-review": ["done", "in-progress", "blocked"],
  done: [],
};

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
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [goals, setGoals] = useState<Goal[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState<TaskWithAgent["status"]>("pending");
  const [newPriority, setNewPriority] = useState<TaskWithAgent["priority"]>("medium");
  const [newAgentId, setNewAgentId] = useState<string>("none");
  const [newGoalId, setNewGoalId] = useState<string>("none");
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

  // Side panel (task detail + comments)
  const [sidePanelTask, setSidePanelTask] = useState<TaskWithAgent | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  // Inline updates
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tasksResult, agentsResult, goalsResult] = await Promise.all([
        getTasks({ includeArchived: showArchived }),
        getAgents(),
        getGoals(),
      ]);
      if (tasksResult.error) setError(tasksResult.error);
      setTasks(tasksResult.data);
      setAgents(agentsResult.data);
      setGoals(goalsResult.data);
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
        goal_id: newGoalId === "none" ? null : newGoalId,
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
          setNewGoalId("none");
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

  async function openSidePanel(task: TaskWithAgent) {
    setSidePanelTask(task);
    setLoadingComments(true);
    const [commentsResult, reviewsResult] = await Promise.all([
      getTaskComments(task.id),
      getTaskReviews(task.id),
    ]);
    setComments(commentsResult.data);
    setReviews(reviewsResult.data);
    setLoadingComments(false);
  }

  async function handleReview(outcome: "approved" | "rejected" | "returned_for_rework") {
    if (!sidePanelTask) return;
    const notes = prompt(outcome === "approved" ? "Approval notes (optional):" : "Rejection reason:");
    if (notes === null) return; // cancelled
    const result = await submitReview(sidePanelTask.id, outcome, notes);
    if (result.data) {
      setReviews((prev) => [result.data!, ...prev]);
      // Reload to update task status
      await load();
    }
  }

  async function handleSendComment() {
    if (!sidePanelTask || !newComment.trim()) return;
    setSendingComment(true);
    const result = await addTaskComment(sidePanelTask.id, newComment.trim());
    if (result.data) {
      setComments((prev) => [...prev, result.data!]);
      setNewComment("");
    }
    setSendingComment(false);
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
    if (quickFilter === "unassigned" && (t.assigned_agent_id || t.status === "done")) return false;
    if (quickFilter === "blocked" && t.status !== "blocked") return false;
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
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
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
    <PageShell>
      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {/* Header bar — matches Mission Control reference */}
      <div className="sticky top-0 z-30 border-b" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
        <div className="px-4 py-2 md:px-6 md:py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Tasks</h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Keep tasks moving through your workflow.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* View toggle — pill style */}
              <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: "var(--surface-muted)" }}>
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: viewMode === "board" ? "var(--text)" : "transparent",
                    color: viewMode === "board" ? "var(--surface)" : "var(--text-muted)",
                  }}
                  onClick={() => setViewMode("board")}
                >
                  Board
                </button>
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: viewMode === "table" ? "var(--text)" : "transparent",
                    color: viewMode === "table" ? "var(--surface)" : "var(--text-muted)",
                  }}
                  onClick={() => setViewMode("table")}
                >
                  List
                </button>
              </div>

              {/* New task */}
              {canWrite && (
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition"
                  style={{ background: "var(--accent)", color: "var(--surface)" }}
                  onClick={() => setCreateOpen(true)}
                  title="New task"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}

              {/* Quick actions */}
              <div className="divider" />

              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                style={{
                  borderColor: quickFilter === "unassigned" ? "var(--accent)" : "var(--border)",
                  color: quickFilter === "unassigned" ? "var(--accent)" : "var(--text-muted)",
                  background: quickFilter === "unassigned" ? "var(--accent-soft)" : "transparent",
                }}
                onClick={() => setQuickFilter(quickFilter === "unassigned" ? null : "unassigned")}
                title="View unassigned tasks"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Unassigned
                <span className="text-[10px] font-semibold" style={{ color: "var(--warning)" }}>
                  {tasks.filter((t) => !t.assigned_agent_id && t.status !== "done").length}
                </span>
              </button>

              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                style={{
                  borderColor: quickFilter === "blocked" ? "var(--danger)" : "var(--border)",
                  color: quickFilter === "blocked" ? "var(--danger)" : "var(--text-muted)",
                  background: quickFilter === "blocked" ? "rgba(220,38,38,0.06)" : "transparent",
                }}
                onClick={() => setQuickFilter(quickFilter === "blocked" ? null : "blocked")}
                title="View blocked tasks"
              >
                <Eye className="h-3.5 w-3.5" />
                Blocked
                <span className="text-[10px] font-semibold" style={{ color: "var(--danger)" }}>
                  {tasks.filter((t) => t.status === "blocked").length}
                </span>
              </button>

              {/* Archive toggle */}
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                style={{ borderColor: "var(--border)", color: showArchived ? "var(--accent)" : "var(--text-muted)" }}
                onClick={() => setShowArchived(!showArchived)}
                title={showArchived ? "Hide archived" : "Show archived"}
              >
                {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </button>

              {/* Settings */}
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                title="Filters"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filters row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
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

            <span className="text-xs" style={{ color: "var(--text-quiet)" }}>
              {filtered.length} task{filtered.length !== 1 ? "s" : ""}
              {filterStatus !== "all" || filterAgent !== "all" ? ` of ${tasks.length}` : ""}
            </span>
          </div>
        </div>
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
                  {goals.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Link to Goal</label>
                      <Select value={newGoalId} onValueChange={setNewGoalId}>
                        <SelectTrigger className="mt-1 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No goal</SelectItem>
                          {goals.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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

      {/* Scheduled Routines Strip */}
      <div className="surface-card px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4" style={{ color: "var(--accent)" }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Scheduled Routines</span>
          </div>
          <div className="divider" />
          {[
            { name: "Daily Autonomy", schedule: "Every hour", status: "active", icon: Zap },
            { name: "Nightly Summary", schedule: "23:00 UTC", status: "active", icon: Calendar },
            { name: "Weekly Review", schedule: "Mondays", status: "upcoming", icon: Clock },
          ].map((routine) => (
            <div key={routine.name} className="flex items-center gap-2 text-xs">
              <routine.icon className="h-3.5 w-3.5" style={{ color: routine.status === "active" ? "var(--success)" : "var(--text-quiet)" }} />
              <span style={{ color: "var(--text)" }}>{routine.name}</span>
              <span style={{ color: "var(--text-quiet)" }}>{routine.schedule}</span>
              <div className={`h-1.5 w-1.5 rounded-full ${routine.status === "active" ? "dot-green" : "dot-gray"}`} />
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
            {3} active
          </span>
        </div>
      </div>

      {/* Board View — Kanban lanes */}
      {viewMode === "board" && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((status) => {
              const columnTasks = filtered.filter((t) => t.status === status);
              const dotColor: Record<string, string> = {
                pending: "dot-gray",
                "in-progress": "dot-blue",
                blocked: "dot-red",
                "in-review": "bg-violet-500",
                done: "dot-green",
              };
              const statusLabel: Record<string, string> = {
                pending: "Pending",
                "in-progress": "In Progress",
                blocked: "Blocked",
                "in-review": "In Review",
                done: "Done",
              };
              const laneAccent: Record<string, string> = {
                pending: "rgba(148, 163, 184, 0.06)",
                "in-progress": "rgba(59, 130, 246, 0.04)",
                blocked: "rgba(220, 38, 38, 0.04)",
                "in-review": "rgba(139, 92, 246, 0.04)",
                done: "rgba(22, 163, 74, 0.04)",
              };

              return (
                <div key={status} className="rounded-xl border flex flex-col" style={{ borderColor: "var(--border)", background: laneAccent[status], maxHeight: "calc(100vh - 280px)" }}>
                  {/* Lane header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${dotColor[status]}`} />
                      <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{statusLabel[status]}</span>
                    </div>
                    <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1.5 text-[10px] font-semibold" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Lane content — independent scroll */}
                  <div className="p-3 space-y-2 flex-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
                    {columnTasks.length === 0 ? (
                      <EmptyState
                        icon={List}
                        title="No tasks"
                        message={`No tasks in ${statusLabel[status].toLowerCase()}.`}
                        className="py-8"
                      />
                    ) : (
                      columnTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`group relative cursor-pointer rounded-lg border p-3.5 transition-all hover:-translate-y-0.5 ${task.is_archived ? "opacity-50" : ""} ${task.blocker ? "border-[rgba(220,38,38,0.3)]" : ""}`}
                          style={{
                            background: "var(--surface)",
                            borderColor: task.blocker ? undefined : "var(--border)",
                            boxShadow: "var(--shadow-card)",
                          }}
                          onClick={() => openSidePanel(task)}
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
                            <div className="min-w-0 space-y-1.5 flex-1">
                              <p className="text-[13px] font-medium line-clamp-2 break-words" style={{ color: "var(--text)" }}>
                                {task.title}
                              </p>
                              {task.blocker && (
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--danger)" }}>
                                  <span className="h-1.5 w-1.5 rounded-full dot-red" />
                                  Blocked
                                </div>
                              )}
                              {!task.assigned_agent_id && status !== "done" && (
                                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--warning)" }}>
                                  <span className="h-1.5 w-1.5 rounded-full dot-amber" />
                                  Unassigned
                                </div>
                              )}
                            </div>
                            <span
                              className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={priorityBadgeStyle[task.priority]}
                            >
                              {task.priority.charAt(0).toUpperCase()}
                            </span>
                          </div>

                          {/* Bottom: assignee + goal + time */}
                          <div className="mt-2.5 flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {task.assigned_agent_id && task.assigned_agent_name ? (
                                <Link
                                  href={`/agents/${task.assigned_agent_id}`}
                                  className="flex items-center gap-1.5 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {task.assigned_agent_emoji && <span>{task.assigned_agent_emoji}</span>}
                                  <span className="truncate">{task.assigned_agent_name}</span>
                                </Link>
                              ) : (
                                <span className="italic truncate" style={{ color: "var(--text-quiet)" }}>Unassigned</span>
                              )}
                              {task.goal_title && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 ml-1">
                                  🎯 {task.goal_title}
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 tabular-nums" style={{ color: "var(--text-quiet)" }}>
                              {timeAgo(task.updated_at)}
                            </span>
                          </div>

                          {/* Quick done on hover */}
                          {/* Quick action: submit for review or approve */}
                          {canWrite && !task.is_archived && status === "in-review" && (
                            <button
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-opacity font-medium"
                              style={{ color: "var(--success)", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.15)" }}
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "done"); }}
                              disabled={updatingId === task.id}
                              title="Approve and mark done"
                            >
                              ✓ Approve
                            </button>
                          )}
                          {canWrite && !task.is_archived && status !== "done" && status !== "in-review" && status !== "blocked" && (
                            <button
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-opacity font-medium"
                              style={{ color: "var(--info)", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "in-review"); }}
                              disabled={updatingId === task.id}
                              title="Submit for review"
                            >
                              ↗ Review
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* Table View */}
      {viewMode === "table" && (
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={List}
              title={tasks.length === 0 ? (showArchived ? "No tasks found" : "No tasks yet") : "No tasks match the current filters"}
              message={tasks.length === 0 ? "Create a new task to get started." : "Try adjusting your filters to see more tasks."}
              action={tasks.length === 0 ? { label: "New Task", onClick: () => setCreateOpen(true) } : undefined}
            />
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
                          {STATUSES.filter((s) => s === task.status || ALLOWED_TRANSITIONS[task.status]?.includes(s)).map((s) => (
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

      {/* Task Detail Side Panel */}
      <Sheet open={!!sidePanelTask} onOpenChange={(open) => { if (!open) setSidePanelTask(null); }}>
        <SheetContent className="w-full sm:max-w-[500px] overflow-y-auto">
          {sidePanelTask && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-left text-base font-semibold" style={{ color: "var(--text)" }}>
                  {sidePanelTask.title}
                </SheetTitle>
                <SheetDescription className="text-left">
                  Task detail and comments · v2
                </SheetDescription>
              </SheetHeader>

              {/* Task details */}
              <div className="space-y-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-quiet)" }}>Status</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      sidePanelTask.status === "done" ? "bg-emerald-100 text-emerald-700" :
                      sidePanelTask.status === "in-progress" ? "bg-blue-100 text-blue-700" :
                      sidePanelTask.status === "blocked" ? "bg-red-100 text-red-700" :
                      "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                    }`}>
                      {sidePanelTask.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-quiet)" }}>Priority</p>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      sidePanelTask.priority === "high" ? "bg-red-100 text-red-700" :
                      sidePanelTask.priority === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {sidePanelTask.priority}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-quiet)" }}>Agent</p>
                    <p className="text-sm" style={{ color: "var(--text)" }}>
                      {sidePanelTask.assigned_agent_name ? (
                        <span>{sidePanelTask.assigned_agent_emoji} {sidePanelTask.assigned_agent_name}</span>
                      ) : (
                        <span style={{ color: "var(--text-quiet)" }}>Unassigned</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-quiet)" }}>Owner</p>
                    <p className="text-sm" style={{ color: "var(--text)" }}>{sidePanelTask.owner}</p>
                  </div>
                </div>

                {sidePanelTask.blocker && (
                  <div className="rounded-lg p-3" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--danger)" }}>Blocker</p>
                    <p className="text-sm" style={{ color: "var(--danger)" }}>{sidePanelTask.blocker}</p>
                  </div>
                )}

                {sidePanelTask.description && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-quiet)" }}>Description</p>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>{sidePanelTask.description}</p>
                  </div>
                )}

                {/* Edit button */}
                <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => { setSidePanelTask(null); openEdit(sidePanelTask); }}>
                  <Pencil className="h-3 w-3" /> Edit Task
                </Button>
              </div>

              {/* Review actions (only for in-review tasks) */}
              {canWrite && sidePanelTask?.status === "in-review" && (
                <div className="pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Review Decision</p>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                      style={{ borderColor: "var(--border)", color: "var(--success)" }}
                      onClick={() => handleReview("approved")}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:border-amber-300 hover:bg-amber-50"
                      style={{ borderColor: "var(--border)", color: "var(--warning)" }}
                      onClick={() => handleReview("returned_for_rework")}
                    >
                      ↩ Rework
                    </button>
                    <button
                      className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:border-red-300 hover:bg-red-50"
                      style={{ borderColor: "var(--border)", color: "var(--danger)" }}
                      onClick={() => handleReview("rejected")}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Review history */}
              {reviews.length > 0 && (
                <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-quiet)" }}>Review History</p>
                  <div className="space-y-2">
                    {reviews.map((review: any) => (
                      <div key={review.id} className="rounded-lg p-2.5" style={{ background: "var(--surface-muted)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <Badge className={`text-[10px] ${
                            review.outcome === "approved" ? "bg-emerald-100 text-emerald-700" :
                            review.outcome === "rejected" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>{review.outcome.replace(/_/g, " ")}</Badge>
                          <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(review.created_at)}</span>
                        </div>
                        {review.notes && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{review.notes}</p>}
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>by {review.reviewed_by}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments section */}
              <div className="pt-4 flex flex-col" style={{ minHeight: "300px" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-quiet)" }}>
                  Comments ({comments.length})
                </p>

                {/* Comments list */}
                <div className="flex-1 space-y-3 overflow-y-auto mb-4">
                  {loadingComments ? (
                    <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading comments...
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-xs mb-1" style={{ color: "var(--text-quiet)" }}>No comments yet</p>
                      <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Start the conversation below.</p>
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold" style={{ color: comment.author_role === "ceo" ? "var(--accent)" : "var(--text)" }}>
                            {comment.author}
                          </span>
                          <Badge variant="outline" className="text-[10px]">{comment.author_role}</Badge>
                          <span className="text-[10px] ml-auto" style={{ color: "var(--text-quiet)" }}>
                            {timeAgo(comment.created_at)}
                          </span>
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{comment.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Message composer — single line with Send button */}
                {canWrite && (
                  <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <input
                      className="flex-1 rounded-lg border px-3 py-2 text-sm"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                      placeholder="Type a message..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSendComment();
                        }
                      }}
                    />
                    <Button size="sm" onClick={handleSendComment} disabled={sendingComment || !newComment.trim()}>
                      {sendingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

    </PageShell>
  );
}
