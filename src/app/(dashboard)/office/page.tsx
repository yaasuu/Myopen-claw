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

const SVG_W = 900;
const SVG_H = 600;

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
    cx: 180, cy: 340,
    desks: [
      { dx: -40, dy: -15 }, { dx: 0, dy: -15 }, { dx: 40, dy: -15 },
      { dx: -40, dy: 15 }, { dx: 0, dy: 15 }, { dx: 40, dy: 15 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: 80, dy: -40 },
      in_review: { dx: 100, dy: 10 },
      waiting_for_input: { dx: 100, dy: 10 },
      blocked: { dx: 0, dy: 50 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 35 },
      offline: { dx: 0, dy: 35 },
    },
  },
  {
    slug: "ops-improvement",
    label: "Ops-Improvement",
    color: "#f59e0b",
    cx: 400, cy: 400,
    desks: [
      { dx: -40, dy: -15 }, { dx: 0, dy: -15 }, { dx: 40, dy: -15 },
      { dx: -40, dy: 15 }, { dx: 0, dy: 15 }, { dx: 40, dy: 15 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: -60, dy: -50 },
      in_review: { dx: 80, dy: -20 },
      waiting_for_input: { dx: 80, dy: -20 },
      blocked: { dx: 0, dy: 50 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 35 },
      offline: { dx: 0, dy: 35 },
    },
  },
  {
    slug: "architecture-systems",
    label: "Architecture",
    color: "#8b5cf6",
    cx: 650, cy: 340,
    desks: [
      { dx: -40, dy: -15 }, { dx: 0, dy: -15 }, { dx: 40, dy: -15 },
      { dx: -40, dy: 15 }, { dx: 0, dy: 15 }, { dx: 40, dy: 15 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: -80, dy: -40 },
      in_review: { dx: -100, dy: 10 },
      waiting_for_input: { dx: -100, dy: 10 },
      blocked: { dx: 0, dy: 50 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 35 },
      offline: { dx: 0, dy: 35 },
    },
  },
  {
    slug: "direct",
    label: "Direct",
    color: "#22c55e",
    cx: 450, cy: 290,
    desks: [
      { dx: -35, dy: -12 }, { dx: 0, dy: -12 }, { dx: 35, dy: -12 },
    ],
    stateShifts: {
      working: { dx: 0, dy: 0 },
      in_discussion: { dx: 50, dy: -30 },
      in_review: { dx: 60, dy: 10 },
      waiting_for_input: { dx: 60, dy: 10 },
      blocked: { dx: 0, dy: 40 },
      available: { dx: 0, dy: 0 },
      paused: { dx: 0, dy: 25 },
      offline: { dx: 0, dy: 25 },
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
      <polygon points="60,450 450,550 840,450 450,350" fill="var(--background)" stroke="var(--border)" strokeWidth={1} />

      {/* Back wall */}
      <polygon points="60,100 450,20 840,100 840,350 450,450 60,350" fill="var(--surface)" stroke="var(--border)" strokeWidth={1} opacity={0.3} />

      {/* Floor grid lines (subtle) */}
      <line x1={150} y1={380} x2={750} y2={380} stroke="var(--border)" strokeWidth={0.3} opacity={0.3} />
      <line x1={200} y1={400} x2={700} y2={400} stroke="var(--border)" strokeWidth={0.3} opacity={0.3} />
      <line x1={250} y1={420} x2={650} y2={420} stroke="var(--border)" strokeWidth={0.3} opacity={0.3} />

      {/* Department desk clusters */}
      {CLUSTERS.map((cluster) => (
        <g key={cluster.slug}>
          {/* Cluster floor pad (subtle) */}
          <ellipse cx={cluster.cx} cy={cluster.cy} rx={70} ry={35}
            fill={cluster.color} opacity={0.04} stroke={cluster.color} strokeWidth={0.5} strokeOpacity={0.15} />

          {/* Empty desk outlines (show where desks are) */}
          {cluster.desks.map((desk, i) => (
            <rect key={i}
              x={cluster.cx + desk.dx - 25} y={cluster.cy + desk.dy - 11}
              width={50} height={22} rx={4}
              fill="none" stroke={cluster.color} strokeWidth={0.5} opacity={0.15}
              strokeDasharray="3,3" />
          ))}

          {/* Cluster label */}
          <text x={cluster.cx} y={cluster.cy + 45} fontSize={8} fontWeight={600}
            fill={cluster.color} textAnchor="middle" opacity={0.5}>
            {cluster.label}
          </text>
        </g>
      ))}

      {/* Meeting area (center, near Yas Claw) */}
      <ellipse cx={450} cy={260} rx={30} ry={15} fill="rgba(139,92,246,0.04)" stroke="rgba(139,92,246,0.1)" strokeWidth={0.5} />
      <text x={450} y={263} fontSize={6} fill="var(--text-quiet)" textAnchor="middle" opacity={0.4}>meeting</text>

      {/* Review area (right side) */}
      <ellipse cx={750} cy={340} rx={25} ry={12} fill="rgba(245,158,11,0.04)" stroke="rgba(245,158,11,0.1)" strokeWidth={0.5} />
      <text x={750} y={343} fontSize={6} fill="var(--text-quiet)" textAnchor="middle" opacity={0.4}>review</text>

      {/* Attention area (bottom) */}
      <ellipse cx={450} cy={490} rx={40} ry={15} fill="rgba(239,68,68,0.03)" stroke="rgba(239,68,68,0.08)" strokeWidth={0.5} />
      <text x={450} y={493} fontSize={6} fill="var(--text-quiet)" textAnchor="middle" opacity={0.4}>attention</text>
    </g>
  );
}

function SVGOrchestrator({ coordination }: { coordination: CoordinationState }) {
  const cx = 450, cy = 200;

  return (
    <g>
      {/* Orchestrator platform (larger, prominent) */}
      <ellipse cx={cx} cy={cy + 30} rx={60} ry={25} fill="var(--accent)" opacity={0.08} />

      {/* Connection lines to department clusters */}
      {CLUSTERS.map((cluster, i) => (
        <line key={i} x1={cx} y1={cy + 10} x2={cluster.cx} y2={cluster.cy}
          stroke="var(--accent)" strokeWidth={1} opacity={0.15} strokeDasharray="4,4" />
      ))}

      {/* Central desk (larger than agent desks) */}
      <rect x={cx - 45} y={cy - 20} width={90} height={40} rx={8}
        fill="var(--surface)" stroke="var(--accent)" strokeWidth={2.5} />

      {/* Yas Claw emoji (larger) */}
      <text x={cx - 20} y={cy + 6} fontSize={24} textAnchor="middle" dominantBaseline="central">🦀</text>

      {/* Label */}
      <text x={cx + 14} y={cy - 4} fontSize={12} fontWeight={700} fill="var(--text)" textAnchor="start" dominantBaseline="central">
        Yas Claw
      </text>
      <text x={cx + 14} y={cy + 10} fontSize={8} fill="var(--accent)" textAnchor="start" dominantBaseline="central">
        ORCHESTRATOR
      </text>

      {/* Coordination indicator */}
      {coordination.isCoordinating && (
        <g>
          <circle cx={cx + 38} cy={cy - 16} r={6} fill="#3b82f6" />
          <text x={cx + 38} y={cy - 15} fontSize={7} fill="white" textAnchor="middle" dominantBaseline="central" fontWeight={700}>
            {coordination.recentRoutes.length + coordination.pendingReviews.length}
          </text>
        </g>
      )}

      {/* Status line */}
      <text x={cx} y={cy + 45} fontSize={8} fill="var(--text-quiet)" textAnchor="middle">
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
  const deskW = 50, deskH = 22;

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
      <rect x={-deskW / 2} y={-deskH / 2} width={deskW} height={deskH} rx={4}
        fill={focused ? "var(--accent)" : "var(--surface)"}
        stroke={focused ? "var(--accent)" : hasAlert ? "#ef4444" : "var(--border)"}
        strokeWidth={focused ? 2 : hasAlert ? 1.5 : 1}
        opacity={focused ? 0.9 : 0.8} />

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
      <circle cx={deskW / 2 - 5} cy={-deskH / 2 + 5} r={3.5} fill={dotColor} />

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

      {/* Isometric Office Scene */}
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--background)" }}>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto" style={{ maxHeight: "75vh" }}>
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
