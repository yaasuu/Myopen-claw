"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Package,
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  Users,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { getAllDeliverables } from "@/lib/data/reviews";
import { getProjects } from "@/lib/data/projects";
import { getAgents } from "@/lib/data/agents";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { Deliverable } from "@/lib/data/reviews";
import type { Project, Agent } from "@/types/dashboard";

type FilterTab = "all" | "pending" | "approved" | "rework" | "rejected";

const TAB_LABELS: Record<FilterTab, { label: string; color: string; bg: string }> = {
  all:      { label: "All",            color: "var(--text)",       bg: "var(--surface-muted)" },
  pending:  { label: "Pending Review", color: "var(--warning)",    bg: "rgba(217,119,6,0.08)" },
  approved: { label: "Approved",       color: "var(--success)",    bg: "rgba(22,163,74,0.08)" },
  rework:   { label: "Rework",         color: "#f97316",           bg: "rgba(249,115,22,0.08)" },
  rejected: { label: "Rejected",       color: "var(--danger)",     bg: "rgba(220,38,38,0.08)" },
};

function statusOf(d: Deliverable): FilterTab {
  if (d.review_stage === "worker_submission") {
    // Worker submitted — outcome on the record represents what the worker claims.
    // If the task has been re-reviewed at orchestrator stage, that's separate.
    // For worker submissions, default to "pending" until orchestrator decides.
    return "pending";
  }
  if (d.outcome === "approved") return "approved";
  if (d.outcome === "rejected") return "rejected";
  if (d.outcome === "returned_for_rework") return "rework";
  return "pending";
}

function statusBadge(tab: FilterTab) {
  const cfg = TAB_LABELS[tab];
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
  const tab = statusOf(d);
  const stageLabel = d.review_stage === "worker_submission" ? "DELIVERABLE" : d.review_stage === "orchestrator" ? "ORCHESTRATOR" : d.review_stage === "yas" ? "YAS REVIEW" : "REVIEW";

  return (
    <div
      className="rounded-xl transition-all"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header (always visible) */}
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
            {statusBadge(tab)}
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

      {/* Expanded body */}
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
            <Link href="/tasks" className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
              View task <ExternalLink className="h-3 w-3" />
            </Link>
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

export default function OutputsPage() {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [dRes, pRes, aRes] = await Promise.all([getAllDeliverables(200), getProjects(), getAgents()]);
    setDeliverables(dRes.data);
    setProjects(pRes.data);
    setAgents(aRes.data);
    setLoading(false);
  }, []);

  useRealtime("task_reviews", load);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived filters ──
  const filtered = useMemo(() => {
    return deliverables.filter((d) => {
      if (tab !== "all" && statusOf(d) !== tab) return false;
      if (filterProject !== "all" && d.project_id !== filterProject) return false;
      if (filterAgent !== "all" && d.assigned_agent_id !== filterAgent) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${d.task_title ?? ""} ${d.evidence ?? ""} ${d.notes ?? ""} ${d.assigned_agent_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deliverables, tab, search, filterProject, filterAgent]);

  // ── Stats ──
  const stats = useMemo(
    () => ({
      total:    deliverables.length,
      approved: deliverables.filter((d) => statusOf(d) === "approved").length,
      pending:  deliverables.filter((d) => statusOf(d) === "pending").length,
      rework:   deliverables.filter((d) => statusOf(d) === "rework").length,
      agents:   new Set(deliverables.map((d) => d.assigned_agent_id).filter(Boolean)).size,
      projects: new Set(deliverables.map((d) => d.project_id).filter(Boolean)).size,
    }),
    [deliverables]
  );

  // ── Group by task ──
  const grouped = useMemo(() => {
    const byTask = new Map<string, Deliverable[]>();
    for (const d of filtered) {
      const key = d.task_id;
      if (!byTask.has(key)) byTask.set(key, []);
      byTask.get(key)!.push(d);
    }
    return Array.from(byTask.entries()).map(([taskId, items]) => ({
      taskId,
      taskTitle: items[0].task_title,
      projectName: items[0].project_name,
      latestDate: items[0].created_at,
      items: items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
  }, [filtered]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Package className="h-6 w-6" style={{ color: "var(--accent)" }} />
            Outputs
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Proof-of-work library — every task that ships has a deliverable here
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total",     value: stats.total,    color: "var(--text)",     bg: "var(--surface)" },
          { label: "Approved",  value: stats.approved, color: "var(--success)",  bg: "rgba(22,163,74,0.06)" },
          { label: "Pending",   value: stats.pending,  color: "var(--warning)",  bg: "rgba(217,119,6,0.06)" },
          { label: "Rework",    value: stats.rework,   color: "#f97316",         bg: "rgba(249,115,22,0.06)" },
          { label: "Contributors", value: stats.agents, color: "var(--accent)",  bg: "var(--accent-soft)" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-xl p-4" style={{ background: bg, border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{label}</p>
            <p className="text-3xl font-black tabular-nums mt-1" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface-muted)" }}>
        {(["all", "pending", "approved", "rework", "rejected"] as FilterTab[]).map((t) => {
          const isActive = tab === t;
          const cfg = TAB_LABELS[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>

        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
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
      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading deliverables…
        </div>
      ) : filtered.length === 0 ? (
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
            Showing {filtered.length} deliverable{filtered.length !== 1 ? "s" : ""} across {grouped.length} task{grouped.length !== 1 ? "s" : ""}
          </p>
          {grouped.map((group) => (
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
                  <DeliverableCard key={d.id} d={d} expanded={expanded.has(d.id)} onToggle={() => toggle(d.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
