"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
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
  List,
  Clock,
  Calendar,
  Eye,
  UserCheck,
  Send,
  Lock,
  FileCheck,
  Package,
  FileText,
  Search,
  RotateCcw,
  XCircle,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  unblockTask,
  updateTaskAssignment,
  dispatchTaskToHermes,
  archiveTask,
  unarchiveTask,
  getGoals,
} from "@/lib/data/tasks";
import { getAgents } from "@/lib/data/agents";
import { getTaskComments, addTaskComment } from "@/lib/data/comments";
import { getTaskReviews, submitReview, submitDeliverable, getAllDeliverables } from "@/lib/data/reviews";
import { getProjects } from "@/lib/data/projects";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { TaskWithAgent, Agent, TaskComment, Goal, TaskStatus, TaskReview, ProjectWithStats } from "@/types/dashboard";
import type { Deliverable } from "@/lib/data/reviews";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/utils";

const statusColors: Record<string, string> = {
  pending: "bg-transparent text-[var(--text-quiet)] border-[var(--border)]",
  dispatched: "bg-[rgba(14,165,233,0.08)] text-sky-600 border-sky-200",
  "in-progress": "bg-[rgba(59,130,246,0.08)] text-[var(--info)] border-blue-200",
  submitted: "bg-[rgba(245,158,11,0.08)] text-amber-700 border-amber-200",
  "in-review": "bg-[rgba(139,92,246,0.08)] text-violet-600 border-violet-200",
  approved: "bg-[rgba(16,185,129,0.08)] text-emerald-700 border-emerald-200",
  blocked: "bg-[rgba(239,68,68,0.08)] text-[var(--danger)] border-red-200",
  rework: "bg-[rgba(249,115,22,0.08)] text-orange-700 border-orange-200",
  done: "bg-[rgba(5,150,105,0.08)] text-[var(--success)] border-emerald-300",
};

const priorityColors: Record<string, { text: string; dot: string }> = {
  high: { text: "text-[var(--danger)]", dot: "dot-red" },
  medium: { text: "text-[var(--warning)]", dot: "dot-amber" },
  low: { text: "text-[var(--text-quiet)]", dot: "bg-gray-400" },
};

const STATUSES: TaskStatus[] = ["pending", "dispatched", "in-progress", "submitted", "in-review", "approved", "blocked", "rework", "done"];
const BOARD_COLUMNS: TaskStatus[] = ["pending", "dispatched", "in-progress", "submitted", "in-review", "approved", "done"];

// Transition rules: from → allowed to
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["dispatched", "blocked"],
  dispatched: ["in-progress", "blocked"],
  "in-progress": ["submitted", "blocked"],
  submitted: ["in-review", "rework", "blocked"],
  "in-review": ["approved", "rework", "blocked"],
  approved: ["done"],
  blocked: ["pending", "dispatched", "in-progress"],
  rework: ["in-progress", "submitted", "blocked"],
  done: [],
};

const priorityBadgeStyle: Record<string, React.CSSProperties> = {
  high: { background: "rgba(220,38,38,0.08)", color: "#dc2626" },
  medium: { background: "rgba(217,119,6,0.08)", color: "#d97706" },
  low: { background: "rgba(22,163,74,0.08)", color: "#16a34a" },
};

function formatDueDate(iso?: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getSlaState(task: TaskWithAgent): { label: string; tone: "danger" | "warning" | "muted" | "ok" } {
  if (task.status === "done" || task.status === "approved") return { label: "Complete", tone: "ok" };
  if (task.sla_breached) return { label: "SLA breached", tone: "danger" };
  if (!task.due_date) return { label: "No SLA", tone: "muted" };

  const dueAt = new Date(task.due_date).getTime();
  const diffHours = (dueAt - Date.now()) / 36e5;
  if (diffHours < 0) return { label: "Overdue", tone: "danger" };
  if (diffHours <= 24) return { label: "Due <24h", tone: "warning" };
  return { label: "On track", tone: "ok" };
}

function slaBadgeClass(tone: ReturnType<typeof getSlaState>["tone"]): string {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-quiet)]";
}
const PRIORITIES: TaskWithAgent["priority"][] = ["high", "medium", "low"];

// ── Outputs view helpers ──────────────────────────────────────────────────────

type OutputFilterTab = "all" | "pending" | "approved" | "rework" | "rejected";

const OUTPUT_TAB_LABELS: Record<OutputFilterTab, { label: string; color: string; bg: string }> = {
  all:      { label: "All",            color: "var(--text)",       bg: "var(--surface-muted)" },
  pending:  { label: "Pending Review", color: "var(--warning)",    bg: "rgba(217,119,6,0.08)" },
  approved: { label: "Approved",       color: "var(--success)",    bg: "rgba(22,163,74,0.08)" },
  rework:   { label: "Rework",         color: "#f97316",           bg: "rgba(249,115,22,0.08)" },
  rejected: { label: "Rejected",       color: "var(--danger)",     bg: "rgba(220,38,38,0.08)" },
};

function deliverableStatus(d: Deliverable): OutputFilterTab {
  if (d.review_stage === "worker_submission") return "pending";
  if (d.outcome === "approved") return "approved";
  if (d.outcome === "rejected") return "rejected";
  if (d.outcome === "returned_for_rework") return "rework";
  return "pending";
}

function outputStatusBadge(tab: OutputFilterTab) {
  const cfg = OUTPUT_TAB_LABELS[tab];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {tab === "approved" && <CheckCircle2 className="h-2.5 w-2.5" />}
      {tab === "pending"  && <Clock className="h-2.5 w-2.5" />}
      {tab === "rework"   && <RotateCcw className="h-2.5 w-2.5" />}
      {tab === "rejected" && <XCircle className="h-2.5 w-2.5" />}
      {cfg.label}
    </span>
  );
}

function DeliverableCard({ d, expanded, onToggle }: { d: Deliverable; expanded: boolean; onToggle: () => void }) {
  const tab = deliverableStatus(d);
  const stageLabel =
    d.review_stage === "worker_submission" ? "DELIVERABLE" :
    d.review_stage === "orchestrator" ? "ORCHESTRATOR" :
    d.review_stage === "yas" ? "YAS REVIEW" : "REVIEW";

  return (
    <div
      className="rounded-xl transition-all"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
    >
      <button onClick={onToggle} className="w-full text-left flex items-start gap-3 p-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
          style={{ background: d.review_stage === "worker_submission" ? "var(--accent-soft)" : "rgba(99,102,241,0.06)" }}
        >
          {d.review_stage === "worker_submission" ? (
            <Package className="h-4 w-4" style={{ color: "var(--accent)" }} />
          ) : (
            <FileText className="h-4 w-4" style={{ color: "#6366f1" }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}
            >
              {stageLabel}
            </span>
            {outputStatusBadge(tab)}
            {d.project_name && (
              <Link
                href="/projects"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                {d.project_name}
              </Link>
            )}
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
            {d.task_title ?? "Untitled task"}
          </p>
          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>
            {d.evidence}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--text-quiet)" }}>
            {d.assigned_agent_name && (
              <span className="flex items-center gap-1">
                {d.assigned_agent_emoji} {d.assigned_agent_name}
              </span>
            )}
            <span>by {d.reviewed_by}</span>
            <span>{timeAgo(d.created_at)}</span>
          </div>
        </div>

        <div className="shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-4 space-y-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-quiet)" }}>
              Evidence / Deliverable
            </p>
            <div className="rounded-lg p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap" style={{ background: "var(--surface-muted)", color: "var(--text)" }}>
              {d.evidence}
            </div>
          </div>

          {d.notes && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-quiet)" }}>Notes</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{d.notes}</p>
            </div>
          )}

          {d.risk_notes && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--warning)" }}>Risk Notes</p>
              <p className="text-sm" style={{ color: "var(--warning)" }}>{d.risk_notes}</p>
            </div>
          )}

          {d.action_required && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--danger)" }}>Action Required</p>
              <p className="text-sm" style={{ color: "var(--danger)" }}>{d.action_required}</p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            {d.assigned_agent_id && (
              <Link href={`/agents/${d.assigned_agent_id}`} className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                View agent <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [viewMode, setViewMode] = useState<"board" | "table" | "outputs">("board");
  const [goals, setGoals] = useState<Goal[]>([]);

  // Outputs view state
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [outputProjects, setOutputProjects] = useState<ProjectWithStats[]>([]);
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [outputTab, setOutputTab] = useState<OutputFilterTab>("all");
  const [outputSearch, setOutputSearch] = useState("");
  const [outputFilterProject, setOutputFilterProject] = useState<string>("all");
  const [outputFilterAgent, setOutputFilterAgent] = useState<string>("all");
  const [outputExpanded, setOutputExpanded] = useState<Set<string>>(new Set());

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
  const [reviews, setReviews] = useState<TaskReview[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  // Review dialog (replaces browser prompt())
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewOutcome, setReviewOutcome] = useState<"approved" | "rejected" | "returned_for_rework" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Dispatch dialog (P11 — Hermes dispatch)
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [dispatchTargetTask, setDispatchTargetTask] = useState<TaskWithAgent | null>(null);
  const [dispatchAgentId, setDispatchAgentId] = useState<string>("none");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [dispatching, setDispatching] = useState(false);

  // Evidence gate (P12 — require evidence before submit-for-review)
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [evidenceTaskId, setEvidenceTaskId] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

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

  // Load deliverables when Outputs view is activated
  useEffect(() => {
    if (viewMode !== "outputs") return;
    let cancelled = false;
    async function loadOutputs() {
      setOutputsLoading(true);
      const [dRes, pRes] = await Promise.all([getAllDeliverables(200), getProjects()]);
      if (!cancelled) {
        setDeliverables(dRes.data);
        setOutputProjects(pRes.data);
        setOutputsLoading(false);
      }
    }
    loadOutputs();
    return () => { cancelled = true; };
  }, [viewMode]);

  // ── Outputs derived data ────────────────────────────
  const filteredDeliverables = useMemo(() => {
    return deliverables.filter((d) => {
      if (outputTab !== "all" && deliverableStatus(d) !== outputTab) return false;
      if (outputFilterProject !== "all" && d.project_id !== outputFilterProject) return false;
      if (outputFilterAgent !== "all" && d.assigned_agent_id !== outputFilterAgent) return false;
      if (outputSearch.trim()) {
        const q = outputSearch.toLowerCase();
        const hay = `${d.task_title ?? ""} ${d.evidence ?? ""} ${d.notes ?? ""} ${d.assigned_agent_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deliverables, outputTab, outputSearch, outputFilterProject, outputFilterAgent]);

  const outputStats = useMemo(() => ({
    total:    deliverables.length,
    approved: deliverables.filter((d) => deliverableStatus(d) === "approved").length,
    pending:  deliverables.filter((d) => deliverableStatus(d) === "pending").length,
    rework:   deliverables.filter((d) => deliverableStatus(d) === "rework").length,
    agents:   new Set(deliverables.map((d) => d.assigned_agent_id).filter(Boolean)).size,
  }), [deliverables]);

  const groupedDeliverables = useMemo(() => {
    const byTask = new Map<string, Deliverable[]>();
    for (const d of filteredDeliverables) {
      const key = d.task_id;
      if (!byTask.has(key)) byTask.set(key, []);
      byTask.get(key)!.push(d);
    }
    return Array.from(byTask.entries()).map(([taskId, items]) => ({
      taskId,
      taskTitle: items[0].task_title,
      projectName: items[0].project_name,
      items: items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
  }, [filteredDeliverables]);

  function toggleDeliverable(id: string) {
    setOutputExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  function handleReview(outcome: "approved" | "rejected" | "returned_for_rework") {
    setReviewOutcome(outcome);
    setReviewNotes("");
    setReviewDialogOpen(true);
  }

  async function handleReviewSubmit() {
    if (!sidePanelTask || !reviewOutcome) return;
    setSubmittingReview(true);
    const result = await submitReview(sidePanelTask.id, reviewOutcome, reviewNotes);
    if (result.data) {
      setReviews((prev) => [result.data!, ...prev]);
      await load();
    }
    setSubmittingReview(false);
    setReviewDialogOpen(false);
    setReviewOutcome(null);
    setReviewNotes("");
  }

  // ── Hermes dispatch (P11) ────────────────────────────
  function openDispatchDialog(task: TaskWithAgent) {
    setDispatchTargetTask(task);
    setDispatchAgentId(task.assigned_agent_id ?? "none");
    setDispatchNotes("");
    setDispatchDialogOpen(true);
  }

  async function handleDispatchSubmit() {
    if (!dispatchTargetTask || dispatchAgentId === "none") return;
    setDispatching(true);
    const result = await dispatchTaskToHermes(dispatchTargetTask.id, dispatchAgentId, dispatchNotes);
    if (!result.error) {
      await load();
      if (sidePanelTask?.id === dispatchTargetTask.id) {
        setSidePanelTask((prev) => prev ? { ...prev, status: "dispatched", assigned_agent_id: dispatchAgentId } : null);
      }
    }
    setDispatching(false);
    setDispatchDialogOpen(false);
    setDispatchTargetTask(null);
  }

  // ── Evidence gate (P12) ──────────────────────────────
  function requestEvidence(taskId: string) {
    setEvidenceTaskId(taskId);
    setEvidenceText("");
    setEvidenceDialogOpen(true);
  }

  async function handleEvidenceSubmit() {
    if (!evidenceTaskId || !evidenceText.trim()) return;
    setSubmittingEvidence(true);
    // Create a proper deliverable record (worker_submission review with evidence)
    await submitDeliverable(evidenceTaskId, evidenceText.trim(), "Yas");
    await load();
    setSubmittingEvidence(false);
    setEvidenceDialogOpen(false);
    setEvidenceTaskId(null);
    setEvidenceText("");
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
    // Evidence gate: require evidence before moving to submitted
    if (newStatusVal === "submitted") {
      requestEvidence(taskId);
      return;
    }
    // Block done without a deliverable
    if (newStatusVal === "done") {
      const reviewsResult = await getTaskReviews(taskId);
      const hasDeliverable = reviewsResult.data.some((r) => r.evidence && r.evidence.trim() !== "");
      if (!hasDeliverable) {
        setError("Cannot mark task done — no deliverable on file. Submit a deliverable (evidence) first.");
        return;
      }
    }
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
                <button
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: viewMode === "outputs" ? "var(--text)" : "transparent",
                    color: viewMode === "outputs" ? "var(--surface)" : "var(--text-muted)",
                  }}
                  onClick={() => setViewMode("outputs")}
                >
                  Outputs
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


      {/* Board View — Kanban lanes */}
      {viewMode === "board" && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((status) => {
              const columnTasks = filtered.filter((t) => t.status === status);
              const dotColor: Record<TaskStatus, string> = {
                pending: "dot-gray",
                dispatched: "dot-blue",
                "in-progress": "dot-blue",
                submitted: "dot-amber",
                "in-review": "bg-violet-500",
                approved: "dot-green",
                blocked: "dot-red",
                rework: "dot-amber",
                done: "dot-green",
              };
              const statusLabel: Record<TaskStatus, string> = {
                pending: "Pending",
                dispatched: "Dispatched",
                "in-progress": "In Progress",
                submitted: "Submitted",
                "in-review": "In Review",
                approved: "Approved",
                blocked: "Blocked",
                rework: "Rework",
                done: "Done",
              };
              const laneAccent: Record<TaskStatus, string> = {
                pending: "rgba(148, 163, 184, 0.06)",
                dispatched: "rgba(14, 165, 233, 0.04)",
                "in-progress": "rgba(59, 130, 246, 0.04)",
                submitted: "rgba(245, 158, 11, 0.04)",
                "in-review": "rgba(139, 92, 246, 0.04)",
                approved: "rgba(22, 163, 74, 0.04)",
                blocked: "rgba(220, 38, 38, 0.04)",
                rework: "rgba(249, 115, 22, 0.04)",
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
                        message={status === "in-progress" ? "No tasks in progress." : status === "in-review" ? "No tasks in review." : `No ${statusLabel[status].toLowerCase()} tasks.`}
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
                              {task.requires_yas_approval && task.status !== "done" && (
                                <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
                                  <Lock className="h-3 w-3" />
                                  Yas approval required
                                </div>
                              )}
                              {(task.due_date || task.sla_hours || task.sla_breached) && (() => {
                                const sla = getSlaState(task);
                                return (
                                  <div className={`inline-flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${slaBadgeClass(sla.tone)}`}>
                                    <Clock className="h-3 w-3" />
                                    {sla.label} · {formatDueDate(task.due_date)}
                                  </div>
                                );
                              })()}
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

                          {/* Quick actions on hover */}
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
                          {canWrite && !task.is_archived && status === "pending" && (
                            <button
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-opacity font-medium flex items-center gap-1"
                              style={{ color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid rgba(99,102,241,0.2)" }}
                              onClick={(e) => { e.stopPropagation(); openDispatchDialog(task); }}
                              disabled={updatingId === task.id}
                              title="Dispatch via Hermes"
                            >
                              <Send className="h-2.5 w-2.5" />
                              Hermes
                            </button>
                          )}
                          {canWrite && !task.is_archived && status !== "done" && status !== "in-review" && status !== "blocked" && status !== "pending" && (
                            <button
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-opacity font-medium"
                              style={{ color: "var(--info)", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "submitted"); }}
                              disabled={updatingId === task.id}
                              title="Submit for review"
                            >
                              ↗ Submit
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
                  <TableHead className="w-40">SLA</TableHead>
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
                        <SelectTrigger className="h-7 w-52 text-xs">
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
                    <TableCell className="text-xs">
                      {(() => {
                        const sla = getSlaState(task);
                        return (
                          <div className="space-y-1">
                            <Badge variant="outline" className={`text-[10px] ${slaBadgeClass(sla.tone)}`}>
                              {sla.label}
                            </Badge>
                            {task.due_date && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDueDate(task.due_date)}</span>
                                {task.sla_hours ? <span>· {task.sla_hours}h</span> : null}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
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

      {/* Outputs View */}
      {viewMode === "outputs" && (
        <div className="space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total",        value: outputStats.total,    color: "var(--text)",    bg: "var(--surface)" },
              { label: "Approved",     value: outputStats.approved, color: "var(--success)", bg: "rgba(22,163,74,0.06)" },
              { label: "Pending",      value: outputStats.pending,  color: "var(--warning)", bg: "rgba(217,119,6,0.06)" },
              { label: "Rework",       value: outputStats.rework,   color: "#f97316",        bg: "rgba(249,115,22,0.06)" },
              { label: "Contributors", value: outputStats.agents,   color: "var(--accent)",  bg: "var(--accent-soft)" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-xl p-4" style={{ background: bg, border: "1px solid var(--border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{label}</p>
                <p className="text-3xl font-black tabular-nums mt-1" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface-muted)" }}>
            {(["all", "pending", "approved", "rework", "rejected"] as OutputFilterTab[]).map((t) => {
              const isActive = outputTab === t;
              const cfg = OUTPUT_TAB_LABELS[t];
              return (
                <button
                  key={t}
                  onClick={() => setOutputTab(t)}
                  className="rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all duration-150"
                  style={{
                    background: isActive ? "var(--surface)" : "transparent",
                    color: isActive ? cfg.color : "var(--text-quiet)",
                    boxShadow: isActive ? "var(--shadow-card)" : "none",
                  }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Search + filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
              <input
                type="text"
                placeholder="Search title, evidence, agent…"
                value={outputSearch}
                onChange={(e) => setOutputSearch(e.target.value)}
                className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>

            <select
              value={outputFilterProject}
              onChange={(e) => setOutputFilterProject(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="all">All projects</option>
              {outputProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>

            <select
              value={outputFilterAgent}
              onChange={(e) => setOutputFilterAgent(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            >
              <option value="all">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
              ))}
            </select>
          </div>

          {/* Results */}
          {outputsLoading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading deliverables…
            </div>
          ) : filteredDeliverables.length === 0 ? (
            <div className="rounded-xl border p-10 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <Package className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--text-quiet)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No deliverables match these filters</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
                {deliverables.length === 0
                  ? "Once agents submit deliverables, they'll appear here as proof-of-work"
                  : "Try clearing some filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                Showing {filteredDeliverables.length} deliverable{filteredDeliverables.length !== 1 ? "s" : ""} across {groupedDeliverables.length} task{groupedDeliverables.length !== 1 ? "s" : ""}
              </p>
              {groupedDeliverables.map((group) => (
                <div key={group.taskId} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <FolderKanban className="h-4 w-4 shrink-0" style={{ color: "var(--text-quiet)" }} />
                    <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{group.taskTitle ?? "Untitled task"}</p>
                    {group.projectName && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>
                        {group.projectName}
                      </span>
                    )}
                    <span className="text-[10px] ml-auto" style={{ color: "var(--text-quiet)" }}>
                      {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((d) => (
                      <DeliverableCard key={d.id} d={d} expanded={outputExpanded.has(d.id)} onToggle={() => toggleDeliverable(d.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
        <SheetContent className="w-full sm:max-w-[480px] flex flex-col p-0 gap-0 overflow-hidden">
          {sidePanelTask && (
            <>
              {/* ── Header ── */}
              <div className="px-5 pt-5 pb-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                {/* Status + Priority chips */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    sidePanelTask.status === "done" || sidePanelTask.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                    sidePanelTask.status === "in-review" ? "bg-violet-100 text-violet-700" :
                    sidePanelTask.status === "submitted" ? "bg-amber-100 text-amber-700" :
                    sidePanelTask.status === "in-progress" ? "bg-blue-100 text-blue-700" :
                    sidePanelTask.status === "dispatched" ? "bg-sky-100 text-sky-700" :
                    sidePanelTask.status === "blocked" ? "bg-red-100 text-red-700" :
                    sidePanelTask.status === "rework" ? "bg-orange-100 text-orange-700" :
                    "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                  }`}>{sidePanelTask.status}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    sidePanelTask.priority === "high" ? "bg-red-100 text-red-700" :
                    sidePanelTask.priority === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-emerald-100 text-emerald-700"
                  }`}>{sidePanelTask.priority}</span>
                  {(() => {
                    const sla = getSlaState(sidePanelTask);
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ml-auto ${slaBadgeClass(sla.tone)}`}>
                        <Clock className="h-3 w-3" />{sla.label}{sidePanelTask.sla_hours ? ` · ${sidePanelTask.sla_hours}h` : ""}
                      </span>
                    );
                  })()}
                </div>

                {/* Title */}
                <h2 className="text-base font-bold leading-snug mb-3" style={{ color: "var(--text)" }}>
                  {sidePanelTask.title}
                </h2>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {sidePanelTask.assigned_agent_name && (
                    <span className="flex items-center gap-1">
                      <span>{sidePanelTask.assigned_agent_emoji}</span>
                      <span>{sidePanelTask.assigned_agent_name}</span>
                    </span>
                  )}
                  {sidePanelTask.owner && (
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />{sidePanelTask.owner}
                    </span>
                  )}
                  {sidePanelTask.due_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{formatDueDate(sidePanelTask.due_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Scrollable body ── */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                {/* Description */}
                {sidePanelTask.description && (
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {sidePanelTask.description}
                  </p>
                )}

                {/* Alerts */}
                {sidePanelTask.sla_breached && (
                  <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
                    <div>
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--danger)" }}>SLA Breached</p>
                      <p className="text-xs" style={{ color: "var(--danger)" }}>
                        {sidePanelTask.sla_breached_at ? `Since ${new Date(sidePanelTask.sla_breached_at).toLocaleString()}` : "This task has crossed its SLA limit."}
                      </p>
                    </div>
                  </div>
                )}
                {sidePanelTask.blocker && (
                  <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
                    <div>
                      <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--danger)" }}>Blocker</p>
                      <p className="text-xs" style={{ color: "var(--danger)" }}>{sidePanelTask.blocker}</p>
                    </div>
                  </div>
                )}
                {sidePanelTask.requires_yas_approval && sidePanelTask.status !== "done" && (
                  <div className="rounded-xl p-3.5 flex items-center gap-2.5" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    <Lock className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                    <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>Yas approval required before done.</p>
                  </div>
                )}

                {/* Hermes dispatch */}
                {sidePanelTask.owner_agent_id && (
                  <div className="rounded-xl p-3.5" style={{ background: "var(--accent-soft)", border: "1px solid rgba(99,102,241,0.2)" }}>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--accent)" }}>Hermes Dispatch</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {agents.find((a) => a.id === sidePanelTask.owner_agent_id)?.name ?? sidePanelTask.owner_agent_id}
                    </p>
                    {sidePanelTask.dispatch_notes && (
                      <p className="text-xs italic mt-1" style={{ color: "var(--text-quiet)" }}>&ldquo;{sidePanelTask.dispatch_notes}&rdquo;</p>
                    )}
                    {sidePanelTask.dispatched_at && (
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>Dispatched {timeAgo(sidePanelTask.dispatched_at)}</p>
                    )}
                  </div>
                )}

                {/* Review actions */}
                {canWrite && sidePanelTask?.status === "in-review" && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold" style={{ color: "var(--text-quiet)" }}>Your review</p>
                    <div className="grid grid-cols-3 gap-2">
                      <button className="rounded-xl border py-2.5 text-xs font-semibold transition-colors hover:bg-emerald-50" style={{ borderColor: "rgba(16,185,129,0.3)", color: "var(--success)" }} onClick={() => handleReview("approved")}>✓ Approve</button>
                      <button className="rounded-xl border py-2.5 text-xs font-semibold transition-colors hover:bg-amber-50" style={{ borderColor: "rgba(245,158,11,0.3)", color: "var(--warning)" }} onClick={() => handleReview("returned_for_rework")}>↩ Rework</button>
                      <button className="rounded-xl border py-2.5 text-xs font-semibold transition-colors hover:bg-red-50" style={{ borderColor: "rgba(220,38,38,0.3)", color: "var(--danger)" }} onClick={() => handleReview("rejected")}>✕ Reject</button>
                    </div>
                  </div>
                )}

                {/* Deliverables */}
                {reviews.filter((r) => r.evidence && r.evidence.trim() !== "").length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-quiet)" }}>
                      Deliverables · {reviews.filter((r) => r.evidence && r.evidence.trim() !== "").length}
                    </p>
                    <div className="space-y-2">
                      {reviews.filter((r) => r.evidence && r.evidence.trim() !== "").map((r) => (
                        <div key={r.id} className="rounded-xl p-3.5" style={{ background: "var(--accent-soft)", border: "1px solid rgba(99,102,241,0.15)" }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                              {r.review_stage === "worker_submission" ? "Submission" : r.review_stage ?? "Deliverable"}
                            </span>
                            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(r.created_at)}</span>
                          </div>
                          <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text)" }}>{r.evidence}</p>
                          <p className="text-[10px] mt-2" style={{ color: "var(--text-quiet)" }}>by {r.reviewed_by}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review history */}
                {reviews.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-quiet)" }}>Review history</p>
                    <div className="space-y-1.5">
                      {reviews.map((review) => (
                        <div key={review.id} className="flex items-start gap-3 py-1.5">
                          <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                            review.outcome === "approved" ? "bg-emerald-500" :
                            review.outcome === "rejected" ? "bg-red-500" : "bg-amber-500"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium capitalize" style={{ color: "var(--text)" }}>{review.outcome.replace(/_/g, " ")}</span>
                              <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>by {review.reviewed_by} · {timeAgo(review.created_at)}</span>
                            </div>
                            {review.notes && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{review.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-quiet)" }}>
                    Comments{comments.length > 0 ? ` · ${comments.length}` : ""}
                  </p>
                  {loadingComments ? (
                    <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: "var(--text-quiet)" }}>No comments yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          {/* Avatar */}
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                            style={{
                              background: comment.author_role === "ceo" ? "var(--accent-soft)" : "var(--surface-muted)",
                              color: comment.author_role === "ceo" ? "var(--accent)" : "var(--text-muted)",
                            }}>
                            {comment.author.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-xs font-semibold" style={{ color: comment.author_role === "ceo" ? "var(--accent)" : "var(--text)" }}>
                                {comment.author}
                              </span>
                              <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(comment.created_at)}</span>
                            </div>
                            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{comment.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Footer: actions + composer ── */}
              <div className="shrink-0 border-t px-5 py-4 space-y-3" style={{ borderColor: "var(--border)" }}>
                {/* Edit / Dispatch */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => { setSidePanelTask(null); openEdit(sidePanelTask); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  {canWrite && sidePanelTask.status === "pending" && (
                    <Button size="sm" className="gap-1.5 flex-1" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => openDispatchDialog(sidePanelTask)}>
                      <Send className="h-3 w-3" /> Dispatch
                    </Button>
                  )}
                </div>
                {/* Composer */}
                {canWrite && (
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 rounded-xl border px-3.5 py-2 text-sm outline-none focus:ring-1"
                      style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)" }}
                      placeholder="Write a comment…"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSendComment(); } }}
                    />
                    <Button size="sm" onClick={handleSendComment} disabled={sendingComment || !newComment.trim()} style={{ background: "var(--accent)", color: "#fff" }}>
                      {sendingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Review Dialog — replaces browser prompt() */}
      <Dialog open={reviewDialogOpen} onOpenChange={(open) => { if (!open) { setReviewDialogOpen(false); setReviewOutcome(null); setReviewNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewOutcome === "approved" && "Approve Task"}
              {reviewOutcome === "returned_for_rework" && "Return for Rework"}
              {reviewOutcome === "rejected" && "Reject Task"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {reviewOutcome === "approved" && "Add any optional notes for this approval."}
              {reviewOutcome === "returned_for_rework" && "Explain what needs to be changed before this can be approved."}
              {reviewOutcome === "rejected" && "Explain why this task is being rejected."}
            </p>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              rows={4}
              placeholder={
                reviewOutcome === "approved" ? "Notes (optional)..." :
                reviewOutcome === "returned_for_rework" ? "What needs to be fixed..." :
                "Reason for rejection..."
              }
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setReviewDialogOpen(false); setReviewOutcome(null); setReviewNotes(""); }} disabled={submittingReview}>
                Cancel
              </Button>
              <Button
                onClick={handleReviewSubmit}
                disabled={submittingReview || (reviewOutcome !== "approved" && !reviewNotes.trim())}
                style={{
                  background: reviewOutcome === "approved" ? "var(--success)" : reviewOutcome === "rejected" ? "var(--danger)" : "var(--warning)",
                  color: "#fff",
                }}
              >
                {submittingReview ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {reviewOutcome === "approved" && "Approve"}
                {reviewOutcome === "returned_for_rework" && "Return for Rework"}
                {reviewOutcome === "rejected" && "Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog (P11) */}
      <Dialog open={dispatchDialogOpen} onOpenChange={(open) => { if (!open) { setDispatchDialogOpen(false); setDispatchTargetTask(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" style={{ color: "var(--accent)" }} />
              Dispatch via Hermes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {dispatchTargetTask && (
              <div className="rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{dispatchTargetTask.title}</p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Agent *</label>
              <Select value={dispatchAgentId} onValueChange={setDispatchAgentId}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select agent…</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.emoji} {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dispatch notes</label>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm resize-none"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                rows={3}
                placeholder="Context for Hermes / the agent… (optional)"
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDispatchDialogOpen(false)} disabled={dispatching}>Cancel</Button>
              <Button
                onClick={handleDispatchSubmit}
                disabled={dispatching || dispatchAgentId === "none"}
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {dispatching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Dispatch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Evidence Gate Dialog (P12) */}
      <Dialog open={evidenceDialogOpen} onOpenChange={(open) => { if (!open) { setEvidenceDialogOpen(false); setEvidenceTaskId(null); setEvidenceText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-4 w-4" style={{ color: "var(--success)" }} />
              Submit for Review — Evidence Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Provide a checkpoint note or evidence link so the reviewer can verify the work.
            </p>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              rows={4}
              placeholder="Evidence link, summary, or checkpoint notes…"
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEvidenceDialogOpen(false)} disabled={submittingEvidence}>Cancel</Button>
              <Button
                onClick={handleEvidenceSubmit}
                disabled={submittingEvidence || !evidenceText.trim()}
                style={{ background: "var(--success)", color: "#fff" }}
              >
                {submittingEvidence ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileCheck className="h-4 w-4 mr-2" />}
                Submit for Review
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </PageShell>
  );
}
