"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Loader2, X, ListTodo, ShieldCheck, GitBranch, AlertTriangle, Clock, Activity, Monitor } from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getDepartments } from "@/lib/data/departments";
import { getTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { getProjects } from "@/lib/data/projects";
import { getCapabilityGaps } from "@/lib/data/capability-governance";
import { deriveAgentPresence, getPresenceConfig, type AgentPresence, type PresenceState } from "@/lib/data/presence";
import { computeCollaborationSignals, computeCoordinationState, type CollaborationSignal, type CoordinationState } from "@/lib/data/collaboration";
import { computeOrchestratorGovernance, type GovernanceSignal, type OrchestratorGovernance } from "@/lib/data/governance";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, Department, FeedEvent, Project } from "@/types/dashboard";

// ─── Helpers ───

function timeAgo(iso: string | null): string {
  if (!iso) return "away";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "active now";
  if (mins < 60) return `${mins}m ago`;
  return `away ${Math.floor(mins / 60)}h`;
}

const DIRECT_SHORT_IDS = ["research-agent", "executive-finance", "qa-agent"];

function getAgentDeptSlug(agent: Agent): string {
  if (DIRECT_SHORT_IDS.includes(agent.short_id)) return "direct";
  return (agent as any).department_slug ?? "";
}

function getDeptLabel(slug: string, departments: Department[]): string {
  if (slug === "direct") return "Direct";
  const dept = departments.find((d) => d.slug === slug);
  return dept?.name ?? slug;
}

// ─── Isometric Office Layout ───
// SVG viewBox: 900x600
// Yas Claw at center (450, 200) — prominent orchestrator
// Departments positioned around Yas Claw:
//   - Export-Growth: left (200, 320)
//   - Ops-Improvement: center-left (400, 380)
//   - Architecture-Systems: right (650, 320)
//   - Direct agents: near Yas Claw (350-550, 280)
// Within each department, agents placed by state:
//   - working → at desks
//   - discussion → near meeting area
//   - review → near review area
//   - blocked → attention area
//   - available → standby desks

// ─── Department Desk Clusters ───
// Each department has a grid of desk positions
// Agents are seated at desks within their department cluster
// State changes shift agents from their desk but keep them near the cluster

const SVG_W = 1000;
const SVG_H = 650;

interface DeskCluster {
  slug: string;
  label: string;
  color: string;
  // Cluster center
  cx: number;
  cy: number;
  // Desk positions (relative to cluster center)
  desks: { dx: number; dy: number }[];
  // State offsets from desk (relative to desk position)
  stateShifts: Record<string, { dx: number; dy: number }>;
}

const CLUSTERS: DeskCluster[] = [
  {
    slug: "export-growth",
    label: "Export-Growth",
    color: "#3b82f6",
    cx: 160, cy: 380,
    desks: [
      { dx: -50, dy: -18 }, { dx: 0, dy: -18 }, { dx: 50, dy: -18 },
      { dx: -50, dy: 18 }, { dx: 0, dy: 18 }, { dx: 50, dy: 18 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: 120, dy: -80 },
      in_review: { dx: 140, dy: 20 },
      waiting_for_input: { dx: 140, dy: 20 },
      blocked: { dx: 0, dy: 60 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 40 },
      offline: { dx: 0, dy: 40 },
    },
  },
  {
    slug: "ops-improvement",
    label: "Ops-Improvement",
    color: "#f59e0b",
    cx: 420, cy: 460,
    desks: [
      { dx: -50, dy: -18 }, { dx: 0, dy: -18 }, { dx: 50, dy: -18 },
      { dx: -50, dy: 18 }, { dx: 0, dy: 18 }, { dx: 50, dy: 18 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: -80, dy: -90 },
      in_review: { dx: 100, dy: -30 },
      waiting_for_input: { dx: 100, dy: -30 },
      blocked: { dx: 0, dy: 60 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 40 },
      offline: { dx: 0, dy: 40 },
    },
  },
  {
    slug: "architecture-systems",
    label: "Architecture",
    color: "#8b5cf6",
    cx: 720, cy: 380,
    desks: [
      { dx: -50, dy: -18 }, { dx: 0, dy: -18 }, { dx: 50, dy: -18 },
      { dx: -50, dy: 18 }, { dx: 0, dy: 18 }, { dx: 50, dy: 18 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: -120, dy: -80 },
      in_review: { dx: -140, dy: 20 },
      waiting_for_input: { dx: -140, dy: 20 },
      blocked: { dx: 0, dy: 60 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 40 },
      offline: { dx: 0, dy: 40 },
    },
  },
  {
    slug: "direct",
    label: "Direct",
    color: "#22c55e",
    cx: 500, cy: 300,
    desks: [
      { dx: -45, dy: -14 }, { dx: 0, dy: -14 }, { dx: 45, dy: -14 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: 60, dy: -50 },
      in_review: { dx: 80, dy: 15 },
      waiting_for_input: { dx: 80, dy: 15 },
      blocked: { dx: 0, dy: 50 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 30 },
      offline: { dx: 0, dy: 30 },
    },
  },
];

// ─── Agent position computation (cluster-based) ───

function computeAgentPositions(
  agents: Agent[],
  presences: AgentPresence[]
): Map<string, { x: number; y: number; dept: string; state: string }> {
  const positions = new Map<string, { x: number; y: number; dept: string; state: string }>();

  // Group agents by department
  const deptAgents: Record<string, Agent[]> = {};
  for (const agent of agents) {
    const deptSlug = getAgentDeptSlug(agent);
    if (!deptAgents[deptSlug]) deptAgents[deptSlug] = [];
    deptAgents[deptSlug].push(agent);
  }

  // Assign each agent to a desk within their cluster
  for (const [deptSlug, deptAgentList] of Object.entries(deptAgents)) {
    const cluster = CLUSTERS.find((c) => c.slug === deptSlug) ?? CLUSTERS[3]; // default to direct

    for (let i = 0; i < deptAgentList.length; i++) {
      const agent = deptAgentList[i];
      const presence = presences.find((p) => p.agentId === agent.id);
      const state = presence?.state ?? "available";

      // Get desk position
      const desk = cluster.desks[i % cluster.desks.length];
      const deskX = cluster.cx + desk.dx;
      const deskY = cluster.cy + desk.dy;

      // Apply state shift
      const shift = cluster.stateShifts[state] ?? cluster.stateShifts["available"];
      const x = deskX + shift.dx;
      const y = deskY + shift.dy;

      positions.set(agent.id, {
        x: Math.max(60, Math.min(840, x)),
        y: Math.max(80, Math.min(560, y)),
        dept: deptSlug,
        state,
      });
    }
  }

  return positions;
}

// ─── SVG Components ───

function SVGRoom() {
  return (
    <g>
      {/* Floor */}
      <polygon className="office-floor" points="80,500 500,600 920,500 500,400" strokeWidth={1.5} />

      {/* Floor shadow */}
      <polygon className="office-shadow" points="100,495 500,590 900,495 500,395" opacity={0.1} />

      {/* Back wall */}
      <polygon className="office-wall" points="80,120 500,30 920,120 920,400 500,500 80,400" strokeWidth={1.5} opacity={0.5} />

      {/* Wall-floor boundary */}
      <line className="office-boundary" x1={80} y1={400} x2={500} y2={500} strokeWidth={1} opacity={0.5} />
      <line className="office-boundary" x1={500} y1={500} x2={920} y2={400} strokeWidth={1} opacity={0.5} />

      {/* Floor grid */}
      <line className="office-grid" x1={200} y1={430} x2={800} y2={430} strokeWidth={0.4} opacity={0.25} />
      <line className="office-grid" x1={250} y1={450} x2={750} y2={450} strokeWidth={0.4} opacity={0.25} />
      <line className="office-grid" x1={300} y1={470} x2={700} y2={470} strokeWidth={0.4} opacity={0.25} />

      {/* ── Meeting Table ── */}
      <g>
        <polygon className="office-shadow" points="500,273 552,298 500,323 448,298" opacity={0.08} />
        <polygon className="zone-meeting" points="500,270 550,295 500,320 450,295" strokeWidth={1.5} />
        <polygon fill="rgba(139,92,246,0.05)" points="500,275 542,295 500,315 458,295" />
        <circle className="zone-meeting-seat" cx={455} cy={278} r={9} strokeWidth={1} strokeDasharray="3,3" />
        <circle className="zone-meeting-seat" cx={545} cy={278} r={9} strokeWidth={1} strokeDasharray="3,3" />
        <circle className="zone-meeting-seat" cx={455} cy={312} r={9} strokeWidth={1} strokeDasharray="3,3" />
        <circle className="zone-meeting-seat" cx={545} cy={312} r={9} strokeWidth={1} strokeDasharray="3,3" />
        <text className="label-zone" x={500} y={336} fontSize={10} textAnchor="middle">
          Meeting Table
        </text>
      </g>

      {/* ── Review Corner ── */}
      <g>
        <rect className="office-shadow" x={792} y={363} width={75} height={35} rx={5} opacity={0.08} />
        <rect className="zone-review" x={790} y={360} width={75} height={35} rx={5} strokeWidth={1.5} />
        <rect fill="rgba(245,158,11,0.04)" x={795} y={365} width={65} height={25} rx={4} />
        <circle className="zone-review-seat" cx={828} cy={408} r={10} strokeWidth={1} strokeDasharray="3,3" />
        <text x={828} y={382} fontSize={13} textAnchor="middle" opacity={0.2}>📋</text>
        <text className="label-zone" x={828} y={426} fontSize={10} textAnchor="middle">
          Review Corner
        </text>
      </g>

      {/* ── Attention Area ── */}
      <g>
        <polygon className="office-shadow" points="500,523 552,548 500,573 448,548" opacity={0.06} />
        <polygon className="zone-attention" points="500,520 550,545 500,570 450,545" strokeWidth={1.5} />
        <rect className="zone-attention" x={476} y={532} width={48} height={22} rx={4} strokeWidth={1} />
        <text x={500} y={547} fontSize={11} textAnchor="middle" opacity={0.25}>⚠</text>
        <text className="label-zone" x={500} y={584} fontSize={10} textAnchor="middle">
          Attention
        </text>
      </g>

      {/* ── Department Desk Clusters ── */}
      {CLUSTERS.map((cluster) => (
        <g key={cluster.slug}>
          <ellipse className="cluster-pad" cx={cluster.cx} cy={cluster.cy} rx={85} ry={42}
            fill={cluster.color} fillOpacity={0.08} stroke={cluster.color} strokeWidth={0.8} />
          {cluster.desks.map((desk, i) => (
            <rect key={i} className="cluster-desk"
              x={cluster.cx + desk.dx - 28} y={cluster.cy + desk.dy - 12}
              width={56} height={24} rx={4}
              fill={cluster.color} stroke={cluster.color} strokeWidth={0.7}
              strokeDasharray="3,3" />
          ))}
          <text className="label-dept" x={cluster.cx} y={cluster.cy + 60} fontSize={11} textAnchor="middle">
            {cluster.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function SVGOrchestrator({ coordination }: { coordination: CoordinationState }) {
  const cx = 500, cy = 210;

  return (
    <g>
      {/* Platform shadow */}
      <ellipse cx={cx + 2} cy={cy + 38} rx={75} ry={30} fill="var(--border)" opacity={0.06} />
      {/* Platform */}
      <ellipse cx={cx} cy={cy + 35} rx={75} ry={30} fill="var(--accent)" opacity={0.1} />

      {/* Connection lines */}
      {CLUSTERS.map((cluster, i) => (
        <line key={i} x1={cx} y1={cy + 15} x2={cluster.cx} y2={cluster.cy}
          stroke="var(--accent)" strokeWidth={1.5} opacity={0.18} strokeDasharray="5,5" />
      ))}

      {/* Desk shadow */}
      <rect x={cx - 53} y={cy - 21} width={110} height={48} rx={10}
        className="office-shadow" opacity={0.1} />
      {/* Central desk */}
      <rect x={cx - 55} y={cy - 24} width={110} height={48} rx={10}
        fill="var(--surface)" stroke="var(--accent)" strokeWidth={3} />

      {/* Yas Claw emoji */}
      <text x={cx - 22} y={cy + 5} fontSize={28} textAnchor="middle" dominantBaseline="central">🦀</text>

      {/* Labels */}
      <text x={cx + 18} y={cy - 6} fontSize={14} fontWeight={700} fill="var(--text)" textAnchor="start" dominantBaseline="central">
        Yas Claw
      </text>
      <text x={cx + 18} y={cy + 12} fontSize={9} fontWeight={600} fill="var(--accent)" textAnchor="start" dominantBaseline="central">
        ORCHESTRATOR
      </text>

      {/* Coordination indicator */}
      {coordination.isCoordinating && (
        <g>
          <circle cx={cx + 48} cy={cy - 18} r={7} fill="#3b82f6" />
          <text x={cx + 48} y={cy - 17} fontSize={8} fill="white" textAnchor="middle" dominantBaseline="central" fontWeight={700}>
            {coordination.recentRoutes.length + coordination.pendingReviews.length}
          </text>
        </g>
      )}

      {/* Status line */}
      <text x={cx} y={cy + 58} fontSize={9} fill="var(--text-quiet)" textAnchor="middle">
        All agents coordinate through this node
      </text>
    </g>
  );
}

function SVGAgentDesk({ agent, presence, x, y, signal, govSignals, focused, onClick }: {
  agent: Agent; presence: AgentPresence | undefined;
  x: number; y: number;
  signal: CollaborationSignal | undefined; govSignals: GovernanceSignal[];
  focused: boolean; onClick: () => void;
}) {
  const config = presence ? getPresenceConfig(presence.state) : null;
  const dotColor = config?.dot === "dot-green" ? "#22c55e" :
    config?.dot === "dot-blue" ? "#3b82f6" :
    config?.dot === "dot-amber" ? "#f59e0b" :
    config?.dot === "dot-red" ? "#ef4444" :
    config?.dot === "bg-violet-500" ? "#8b5cf6" : "#6b7280";

  const hasAlert = govSignals.some((s) => s.severity === "critical" || s.severity === "attention");
  const isAway = presence?.state === "paused" || presence?.state === "offline";
  const deskW = 56, deskH = 24;

  // All elements rendered at (0,0) origin — group handles position via CSS transform
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      style={{
        cursor: "pointer",
        transition: "transform 280ms ease-out, opacity 280ms ease-out",
        opacity: isAway ? 0.45 : 1,
      }}
    >
      {/* Desk surface */}
      <rect x={-deskW / 2} y={-deskH / 2} width={deskW} height={deskH} rx={5}
        fill={focused ? "var(--accent)" : "var(--surface)"}
        stroke={focused ? "var(--accent)" : hasAlert ? "#ef4444" : "var(--border-strong)"}
        strokeWidth={focused ? 2.5 : hasAlert ? 2 : 1.5}
        opacity={focused ? 0.95 : 0.9} />

      {/* Agent emoji */}
      <text x={-14} y={1} fontSize={14} textAnchor="middle" dominantBaseline="central">
        {agent.emoji}
      </text>

      {/* Agent name (truncated) */}
      <text x={4} y={-3} fontSize={8} fontWeight={600} fill="var(--text)" textAnchor="start" dominantBaseline="central">
        {agent.name.length > 10 ? agent.name.slice(0, 10) + "…" : agent.name}
      </text>

      {/* State label */}
      <text x={4} y={7} fontSize={6.5} fill={config?.color ?? "var(--text-quiet)"} textAnchor="start" dominantBaseline="central">
        {config?.label ?? presence?.state ?? "—"}
      </text>

      {/* Presence dot */}
      <circle
        cx={deskW / 2 - 5} cy={-deskH / 2 + 5} r={3.5} fill={dotColor}
        style={
          presence && ["working", "in_discussion", "in_review", "waiting_for_input"].includes(presence.state)
            ? { animation: "presence-pulse 3s ease-in-out infinite" }
            : undefined
        }
      />

      {/* Alert badge */}
      {hasAlert && (
        <g>
          <circle cx={-deskW / 2 + 5} cy={-deskH / 2 + 5} r={4} fill="#ef4444" />
          <text x={-deskW / 2 + 5} y={-deskH / 2 + 6} fontSize={6} fill="white" textAnchor="middle" dominantBaseline="central" fontWeight={700}>!</text>
        </g>
      )}

      {/* Collaboration indicator */}
      {signal?.discussionSummary && (
        <rect x={-18} y={deskH / 2 + 2} width={36} height={8} rx={3} fill="rgba(139,92,246,0.2)" />
      )}
    </g>
  );
}

// ─── Detail panel ───

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  task_created: { color: "var(--info)", label: "Created" },
  task_updated: { color: "var(--text-quiet)", label: "Updated" },
  task_completed: { color: "var(--success)", label: "Completed" },
  agent_routed: { color: "var(--info)", label: "Routed" },
  blocker_detected: { color: "var(--danger)", label: "Blocker" },
  blocker_resolved: { color: "var(--success)", label: "Resolved" },
};

function AgentDetailPanel({ agent, presence, signal, tasks, events, departments, projects, onClose }: {
  agent: Agent; presence: AgentPresence; signal: CollaborationSignal | undefined;
  tasks: TaskWithAgent[]; events: FeedEvent[]; departments: Department[]; projects: Project[];
  onClose: () => void;
}) {
  const config = getPresenceConfig(presence.state);
  const allAgentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const openAgentTasks = allAgentTasks.filter((t) => t.status !== "done");
  const agentEvents = events.filter((e) => e.related_agent_id === agent.id).slice(0, 8);
  const dept = departments.find((d) => d.slug === (agent as any).department_slug || d.id === (agent as any).department_id);
  const departmentLabel = dept ? dept.name : DIRECT_SHORT_IDS.includes(agent.short_id) ? "Direct" : "Unassigned";

  const today = new Date().toISOString().slice(0, 10);
  const completedToday = allAgentTasks.filter((t) => t.status === "done" && t.updated_at?.slice(0, 10) === today).length;
  const inProgressToday = allAgentTasks.filter((t) => t.status === "in-progress").length;
  const inReviewToday = allAgentTasks.filter((t) => t.status === "in-review").length;
  const blockedToday = allAgentTasks.filter((t) => t.status === "blocked").length;

  const primaryTask = openAgentTasks.find((t) => t.status === "in-progress") ?? openAgentTasks[0] ?? null;
  const waitingTask = openAgentTasks.find((t) => t.status === "in-review");
  const blockedTask = openAgentTasks.find((t) => t.status === "blocked");
  const linkedProject = primaryTask?.project_id ? projects.find((p) => p.id === primaryTask.project_id) : null;

  return (
    <div className="fixed right-0 top-0 h-full z-50 overflow-y-auto" style={{ width: "min(380px, 92vw)", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "0 0 20px rgba(0,0,0,0.1)" }}>
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-2xl">{agent.emoji}</span>
            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${config?.dot ?? "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{agent.name}</p>
            <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>{departmentLabel}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-quiet)" }}><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <div className={`h-2 w-2 rounded-full ${config?.dot ?? "dot-gray"}`} />
          <span className="text-xs font-semibold" style={{ color: config?.color ?? "var(--text-quiet)" }}>{config?.label ?? presence.state}</span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Last activity: {presence.lastActivity ? timeAgo(presence.lastActivity) : "None"}</p>
      </div>

      <div className="p-4 grid grid-cols-3 gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: completedToday > 0 ? "var(--success)" : "var(--text)" }}>{completedToday}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Done</p></div>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: "var(--text)" }}>{inProgressToday}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Active</p></div>
        <div className="text-center"><p className="text-sm font-bold" style={{ color: inReviewToday > 0 ? "var(--warning)" : "var(--text)" }}>{inReviewToday}</p><p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Review</p></div>
        {blockedToday > 0 && <div className="text-center col-span-3"><p className="text-sm font-bold" style={{ color: "var(--danger)" }}>{blockedToday}</p><p className="text-[10px]" style={{ color: "var(--danger)" }}>Blocked</p></div>}
      </div>

      {(primaryTask || waitingTask || blockedTask) && (
        <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Current Context</p>
          <div className="flex flex-col gap-2">
            {primaryTask && <Link href="/tasks" className="p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-quiet)" }}>Working on</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{primaryTask.title}</p></Link>}
            {waitingTask && <Link href="/reviews" className="p-2 rounded hover:opacity-80" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--warning)" }}>Awaiting review</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{waitingTask.title}</p></Link>}
            {blockedTask && <div className="p-2 rounded" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--danger)" }}>Blocked</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{blockedTask.title}</p>{blockedTask.blocker && <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>{blockedTask.blocker}</p>}</div>}
            {linkedProject && <Link href={`/projects/${linkedProject.id}`} className="p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}><p className="text-[10px] font-semibold mb-1" style={{ color: "var(--text-quiet)" }}>Project</p><p className="text-[11px]" style={{ color: "var(--text)" }}>{linkedProject.title}</p><span className="text-[9px] px-1 rounded" style={{ background: "var(--accent)", color: "white" }}>{linkedProject.project_code}</span></Link>}
          </div>
        </div>
      )}

      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-quiet)" }}>Recent Timeline</p>
        {agentEvents.length === 0 ? <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No recent activity</p> : (
          <div className="flex flex-col gap-0">{agentEvents.map((event, i) => { const evConfig = EVENT_CONFIG[event.event_type] ?? { color: "var(--text-quiet)", label: event.event_type }; return (
            <div key={event.id} className="flex gap-2">
              <div className="flex flex-col items-center"><div className="mt-1 h-3 w-3 rounded-full" style={{ background: evConfig.color + "30", border: `1px solid ${evConfig.color}` }} />{i < agentEvents.length - 1 && <div className="w-px flex-1" style={{ background: "var(--border)" }} />}</div>
              <div className="pb-2 flex-1 min-w-0"><p className="text-[10px] truncate" style={{ color: "var(--text)" }}>{event.summary}</p><p className="text-[9px]" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p></div>
            </div>
          ); })}</div>
        )}
      </div>

      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Quick Links</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/agents/${agent.id}`} className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Workforce</Link>
          <Link href="/tasks" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Tasks</Link>
          <Link href="/reviews" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Reviews</Link>
          <Link href="/live-feed" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>Feed</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Time Pressure Helpers ───

function getAgeMs(iso: string): number {
  return Date.now() - new Date(iso).getTime();
}

function ageLabel(iso: string): string {
  const ms = getAgeMs(iso);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function agePressure(iso: string): "fresh" | "aging" | "attention" | "stale" {
  const ms = getAgeMs(iso);
  if (ms < 30 * 60000) return "fresh";         // < 30 min
  if (ms < 2 * 3600000) return "aging";         // < 2 hours
  if (ms < 8 * 3600000) return "attention";     // < 8 hours
  return "stale";                                // > 8 hours
}

function pressureColor(p: "fresh" | "aging" | "attention" | "stale"): string {
  if (p === "fresh") return "var(--text-quiet)";
  if (p === "aging") return "var(--warning)";
  if (p === "attention") return "#f97316"; // orange
  return "var(--danger)";
}

function pressureChipBg(p: "fresh" | "aging" | "attention" | "stale"): string {
  if (p === "fresh") return "var(--surface)";
  if (p === "aging") return "rgba(245,158,11,0.08)";
  if (p === "attention") return "rgba(249,115,22,0.08)";
  return "rgba(239,68,68,0.08)";
}

// ─── CEO Command Center ───

function CEOCommandCenter({ agents, presences, governance, tasks, departments }: {
  agents: Agent[]; presences: AgentPresence[]; governance: OrchestratorGovernance;
  tasks: TaskWithAgent[]; departments: Department[];
}) {
  const blockedAgents = presences.filter((p) => p.state === "blocked");
  const reviewAgents = presences.filter((p) => p.state === "in_review" || p.state === "waiting_for_input");
  const discussionAgents = presences.filter((p) => p.state === "in_discussion");
  const workingAgents = presences.filter((p) => p.state === "working");

  // Compute aged items
  const blockedWithAge = blockedAgents.map((p) => {
    const agent = agents.find((a) => a.id === p.agentId);
    const blockedTask = tasks.find((t) => t.assigned_agent_id === p.agentId && t.status === "blocked");
    const age = blockedTask ? ageLabel(blockedTask.updated_at) : "unknown";
    const pressure = blockedTask ? agePressure(blockedTask.updated_at) : "fresh";
    return { presence: p, agent, age, pressure, ageMs: blockedTask ? getAgeMs(blockedTask.updated_at) : 0 };
  }).sort((a, b) => b.ageMs - a.ageMs); // oldest first

  const reviewWithAge = reviewAgents.map((p) => {
    const agent = agents.find((a) => a.id === p.agentId);
    const reviewTask = tasks.find((t) => t.assigned_agent_id === p.agentId && t.status === "in-review");
    const age = reviewTask ? ageLabel(reviewTask.updated_at) : "unknown";
    const pressure = reviewTask ? agePressure(reviewTask.updated_at) : "fresh";
    return { presence: p, agent, age, pressure, ageMs: reviewTask ? getAgeMs(reviewTask.updated_at) : 0 };
  }).sort((a, b) => b.ageMs - a.ageMs); // oldest first

  // Department pressure with aging
  const deptPressure: { name: string; blocked: number; review: number; oldestAge: string; oldestPressure: string }[] = [];
  for (const dept of departments) {
    const deptAgents = agents.filter((a) => (a as any).department_slug === dept.slug);
    const deptTasks = tasks.filter((t) => deptAgents.some((a) => a.id === t.assigned_agent_id));
    const blocked = deptTasks.filter((t) => t.status === "blocked");
    const review = deptTasks.filter((t) => t.status === "in-review");
    if (blocked.length > 0 || review.length > 0) {
      const allAged = [...blocked, ...review].map((t) => ({ ageMs: getAgeMs(t.updated_at), updated: t.updated_at }));
      const oldest = allAged.sort((a, b) => b.ageMs - a.ageMs)[0];
      deptPressure.push({
        name: dept.name,
        blocked: blocked.length,
        review: review.length,
        oldestAge: oldest ? ageLabel(oldest.updated) : "",
        oldestPressure: oldest ? agePressure(oldest.updated) : "fresh",
      });
    }
  }

  // Priority items with age
  const priorityItems: { label: string; detail: string; href: string; color: string; age: string; pressure: "fresh" | "aging" | "attention" | "stale"; ageMs: number }[] = [];

  if (reviewWithAge.length > 0) {
    const oldest = reviewWithAge[0];
    priorityItems.push({
      label: `${governance.pendingReviews} review${governance.pendingReviews > 1 ? "s" : ""} awaiting`,
      detail: `pending ${oldest.age} · CEO approval needed`,
      href: "/reviews",
      color: "var(--warning)",
      age: oldest.age,
      pressure: oldest.pressure,
      ageMs: oldest.ageMs,
    });
  }

  if (blockedWithAge.length > 0) {
    const oldest = blockedWithAge[0];
    const names = blockedWithAge.map((b) => b.agent?.name ?? "Unknown").join(", ");
    priorityItems.push({
      label: `${governance.blockedAgents} blocked agent${governance.blockedAgents > 1 ? "s" : ""}`,
      detail: `blocked ${oldest.age} · ${names}`,
      href: "/tasks",
      color: "var(--danger)",
      age: oldest.age,
      pressure: oldest.pressure,
      ageMs: oldest.ageMs,
    });
  }

  if (governance.capabilityAlerts > 0) {
    priorityItems.push({
      label: `${governance.capabilityAlerts} skill gap${governance.capabilityAlerts > 1 ? "s" : ""}`,
      detail: "Capability recommendation pending",
      href: "/skills",
      color: "var(--accent)",
      age: "",
      pressure: "fresh",
      ageMs: 0,
    });
  }

  if (governance.overloadedAgents > 0) {
    priorityItems.push({
      label: `${governance.overloadedAgents} overloaded agent${governance.overloadedAgents > 1 ? "s" : ""}`,
      detail: "Workload rebalancing may help",
      href: "/workforce",
      color: "var(--warning)",
      age: "",
      pressure: "fresh",
      ageMs: 0,
    });
  }

  // Sort by age (oldest first) then by type priority
  priorityItems.sort((a, b) => {
    if (a.ageMs > 0 && b.ageMs > 0) return b.ageMs - a.ageMs;
    if (a.ageMs > 0) return -1;
    if (b.ageMs > 0) return 1;
    return 0;
  });

  // Executive summary
  const worstBlocked = blockedWithAge.length > 0 ? blockedWithAge[0].pressure : "fresh";
  const worstReview = reviewWithAge.length > 0 ? reviewWithAge[0].pressure : "fresh";
  const worstPressure = worstBlocked === "stale" || worstReview === "stale" ? "stale"
    : worstBlocked === "attention" || worstReview === "attention" ? "attention"
    : worstBlocked === "aging" || worstReview === "aging" ? "aging" : "fresh";

  let summary = "Office running smoothly";
  if (blockedAgents.length > 0 && reviewAgents.length > 0) {
    const oldest = blockedWithAge[0]?.age ?? reviewWithAge[0]?.age ?? "";
    summary = `Review + blockers pressure — oldest ${oldest}`;
  } else if (blockedAgents.length > 0) {
    summary = `Blocker pressure on ${blockedAgents.length} agent${blockedAgents.length > 1 ? "s" : ""} — oldest ${blockedWithAge[0]?.age}`;
  } else if (reviewAgents.length > 0) {
    summary = `Review backlog — ${reviewAgents.length} awaiting, oldest ${reviewWithAge[0]?.age}`;
  } else if (discussionAgents.length > 0) {
    summary = `Active discussions — ${discussionAgents.length} in meeting`;
  } else if (workingAgents.length > 0) {
    summary = `${workingAgents.length} agent${workingAgents.length > 1 ? "s" : ""} working — office active`;
  }

  // Collapsed state
  if (priorityItems.length === 0 && deptPressure.length === 0) {
    return (
      <div className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
        <span className="text-[10px]" style={{ color: "var(--success)" }}>●</span>
        <span className="text-xs" style={{ color: "var(--text-quiet)" }}>{summary}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 mb-4" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
      {/* Executive summary */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px]" style={{ color: pressureColor(worstPressure) }}>●</span>
        <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{summary}</span>
      </div>

      {/* Priority queue */}
      {priorityItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {priorityItems.slice(0, 4).map((item, i) => (
            <Link key={i} href={item.href} className="flex items-center justify-between p-2 rounded hover:opacity-80" style={{ background: pressureChipBg(item.pressure), border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: pressureColor(item.pressure) }} />
                <div className="min-w-0">
                  <span className="text-[11px] font-medium" style={{ color: "var(--text)" }}>{item.label}</span>
                  <span className="text-[10px] ml-1.5 truncate" style={{ color: "var(--text-quiet)" }}>{item.detail}</span>
                </div>
              </div>
              {item.age && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ml-2" style={{ background: pressureChipBg(item.pressure), color: pressureColor(item.pressure) }}>
                  {item.age}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Department pressure with aging */}
      {deptPressure.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          {deptPressure.map((dept, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: pressureChipBg(dept.oldestPressure as any), color: pressureColor(dept.oldestPressure as any) }}>
              {dept.name}: {dept.blocked > 0 ? `${dept.blocked} blocked` : ""}{dept.blocked > 0 && dept.review > 0 ? ", " : ""}{dept.review > 0 ? `${dept.review} review` : ""}
              {dept.oldestAge && <span className="opacity-70">({dept.oldestAge})</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ───

export default function OfficePage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [presences, setPresences] = useState<AgentPresence[]>([]);
  const [signals, setSignals] = useState<Map<string, CollaborationSignal>>(new Map());
  const [coordination, setCoordination] = useState<CoordinationState>({ isCoordinating: false, recentRoutes: [], pendingReviews: [], activeDiscussions: [] });
  const [governance, setGovernance] = useState<OrchestratorGovernance>({ pendingReviews: 0, blockedAgents: 0, overloadedAgents: 0, capabilityAlerts: 0, needsAttention: 0, signals: [] });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);

  async function load() {
    try {
      const [a, d, t, e, p] = await Promise.all([getAgents(), getDepartments(), getTasks(), getFeedEvents(50), getProjects()]);
      setAgents(a.data); setDepartments(d.data); setTasks(t.data); setEvents(e.data); setProjects(p.data);
      const presenceList = a.data.map((agent) => deriveAgentPresence(agent, t.data, e.data));
      setPresences(presenceList);
      const agentIds = a.data.map((agent) => agent.id);
      const collabSignals = computeCollaborationSignals(e.data, agentIds);
      setSignals(collabSignals); setCoordination(computeCoordinationState(e.data, agentIds));
      const { getAllTaskReviews } = await import("@/lib/data/reviews");
      const [reviewsResult, gapsResult] = await Promise.all([getAllTaskReviews(100), getCapabilityGaps({ limit: 50 })]);
      const reviewOutcomes = reviewsResult.data.map((r) => ({ task_id: r.task_id, outcome: r.outcome }));
      const gapsFlat = gapsResult.data.map((g) => ({ agent_id: (g as any).agent_id ?? null, urgency_level: (g as any).urgency_level ?? "low", composite_score: (g as any).composite_score ?? 0 }));
      setGovernance(computeOrchestratorGovernance(a.data, t.data, e.data, reviewOutcomes, gapsFlat));
    } catch (err) {
      console.error("Office load error:", err);
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks", "feed_events"], loadRef);
  useEffect(() => { const interval = setInterval(() => load(), 10000); return () => clearInterval(interval); }, []);
  useEffect(() => { load(); }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const currentIdx = agents.findIndex((a) => a.id === focusedAgentId);
      switch (e.key) {
        case "ArrowDown": { e.preventDefault(); const next = (currentIdx + 1) % agents.length; setFocusedAgentId(agents[next].id); break; }
        case "ArrowUp": { e.preventDefault(); const prev = currentIdx <= 0 ? agents.length - 1 : currentIdx - 1; setFocusedAgentId(agents[prev].id); break; }
        case "Enter": if (focusedAgentId) { e.preventDefault(); const a = agents.find((a) => a.id === focusedAgentId); if (a) setSelectedAgent(a); } break;
        case "Escape": if (selectedAgent) { e.preventDefault(); setSelectedAgent(null); } else if (focusedAgentId) { e.preventDefault(); setFocusedAgentId(null); } break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agents, focusedAgentId, selectedAgent]);

  // Compute positions
  const agentPositions = useMemo(() => computeAgentPositions(agents, presences), [agents, presences]);

  // Summary counts
  const workingCount = presences.filter((p) => p.state === "working").length;
  const discussionCount = presences.filter((p) => p.state === "in_discussion").length;
  const reviewCount = presences.filter((p) => p.state === "in_review" || p.state === "waiting_for_input").length;
  const blockedCount = presences.filter((p) => p.state === "blocked").length;
  const awayCount = presences.filter((p) => p.state === "paused" || p.state === "offline").length;

  if (loading) return <PageShell title="Office" description="Loading..."><div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading office...</div></PageShell>;

  const selectedPresence = selectedAgent ? presences.find((p) => p.agentId === selectedAgent.id) : null;

  return (
    <PageShell title="Office" description="Live isometric office — agents, work states, and operations">
      {/* Summary strip */}
      <div className="rounded-lg p-3 mb-4 flex items-center gap-3 overflow-x-auto text-xs" style={{ background: "var(--background)", border: "1px solid var(--border)", WebkitOverflowScrolling: "touch" }}>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} /><span style={{ color: "var(--text-quiet)" }}>Online {presences.filter((p) => p.state !== "paused" && p.state !== "offline").length}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--info)" }} /><span style={{ color: "var(--text-quiet)" }}>Work {workingCount}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} /><span style={{ color: "var(--text-quiet)" }}>Talk {discussionCount}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} /><span style={{ color: "var(--text-quiet)" }}>Review {reviewCount}</span></div>
        <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ color: "var(--danger)" }} /><span style={{ color: "var(--text-quiet)" }}>Blocked {blockedCount}</span></div>
        {awayCount > 0 && <div className="flex items-center gap-1.5 whitespace-nowrap"><div className="h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} /><span style={{ color: "var(--text-quiet)" }}>Away {awayCount}</span></div>}
        <div className="flex items-center gap-1.5 ml-auto shrink-0"><div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} /><span style={{ color: "var(--text-quiet)" }}>live</span></div>
      </div>

      {/* CEO Command Center */}
      <CEOCommandCenter
        agents={agents}
        presences={presences}
        governance={governance}
        tasks={tasks}
        departments={departments}
      />

      {/* Isometric Office Scene */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--background)" }}>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto" style={{ maxHeight: "80vh" }}>
          {/* Presence dot pulse + theme-aware office colors */}
          <style>{`
            @keyframes presence-pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
            .office-floor { fill: var(--surface-muted); stroke: var(--border-strong); }
            .office-wall { fill: var(--surface); stroke: var(--border); }
            .office-shadow { fill: var(--border-strong); }
            .office-grid { stroke: var(--border); }
            .office-boundary { stroke: var(--border-strong); }
            .desk-fill { fill: var(--surface); stroke: var(--border-strong); }
            .desk-outline { fill: var(--surface-muted); stroke: var(--border); }
            .zone-meeting { fill: rgba(139,92,246,0.1); stroke: rgba(139,92,246,0.3); }
            .zone-meeting-seat { fill: rgba(139,92,246,0.08); stroke: rgba(139,92,246,0.25); }
            .zone-review { fill: rgba(245,158,11,0.1); stroke: rgba(245,158,11,0.3); }
            .zone-review-seat { fill: rgba(245,158,11,0.08); stroke: rgba(245,158,11,0.2); }
            .zone-attention { fill: rgba(239,68,68,0.08); stroke: rgba(239,68,68,0.2); }
            .cluster-pad { stroke-opacity: 0.3; }
            .cluster-desk { stroke-opacity: 0.3; fill-opacity: 0.06; }
            .label-zone { fill: var(--text-muted); font-weight: 600; }
            .label-dept { fill: var(--text-muted); font-weight: 600; }
          `}</style>
          {/* Room */}
          <SVGRoom />

          {/* Orchestrator (Yas Claw) */}
          <SVGOrchestrator coordination={coordination} />

          {/* Agents */}
          {agents.map((agent) => {
            const pos = agentPositions.get(agent.id);
            if (!pos) return null;
            const presence = presences.find((p) => p.agentId === agent.id);
            return (
              <SVGAgentDesk
                key={agent.id}
                agent={agent}
                presence={presence}
                x={pos.x}
                y={pos.y}
                signal={signals.get(agent.id)}
                govSignals={governance.signals.filter((gs) => gs.agentId === agent.id)}
                focused={agent.id === focusedAgentId}
                onClick={() => setSelectedAgent(agent)}
              />
            );
          })}
        </svg>
      </div>

      {/* Governance row */}
      {governance.needsAttention > 0 && (
        <div className="rounded-lg p-3 mt-4 flex flex-wrap gap-2" style={{ border: "1px solid var(--border)" }}>
          {governance.pendingReviews > 0 && <Link href="/reviews" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}><Clock className="h-2.5 w-2.5" />{governance.pendingReviews} review{governance.pendingReviews > 1 ? "s" : ""}</Link>}
          {governance.blockedAgents > 0 && <Link href="/tasks" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}><AlertTriangle className="h-2.5 w-2.5" />{governance.blockedAgents} blocked</Link>}
          {governance.overloadedAgents > 0 && <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.08)", color: "var(--warning)" }}><Activity className="h-2.5 w-2.5" />{governance.overloadedAgents} overloaded</span>}
          {governance.capabilityAlerts > 0 && <Link href="/skills" className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "var(--accent)" }}><ShieldCheck className="h-2.5 w-2.5" />{governance.capabilityAlerts} skill gap{governance.capabilityAlerts > 1 ? "s" : ""}</Link>}
        </div>
      )}

      {/* Detail side panel */}
      {selectedAgent && selectedPresence && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.15)" }} onClick={() => setSelectedAgent(null)} />
          <AgentDetailPanel agent={selectedAgent} presence={selectedPresence} signal={signals.get(selectedAgent.id)} tasks={tasks} events={events} departments={departments} projects={projects} onClose={() => setSelectedAgent(null)} />
        </>
      )}
    </PageShell>
  );
}
