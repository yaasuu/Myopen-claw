"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Loader2, X, ListTodo, Users, Radio, ShieldCheck, GitBranch, MessageSquare, AlertTriangle, CheckCircle2, Clock, Activity, Monitor, FolderOpen, Search, ChevronDown, ChevronRight } from "lucide-react";
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

function getPresenceZone(state: PresenceState): string {
  if (state === "working") return "working";
  if (state === "in_discussion") return "discussion";
  if (state === "in_review" || state === "waiting_for_input") return "review";
  if (state === "blocked") return "blocked";
  if (state === "available") return "available";
  return "away";
}

// ─── Isometric Office Configuration ───
// Room: 800x500 SVG viewBox
// Floor: isometric diamond
// Zones are colored floor regions
// Agents placed on desks within zones

const ROOM_W = 800;
const ROOM_H = 500;

interface ZoneLayout {
  id: string;
  label: string;
  // Floor polygon (isometric)
  floor: string;
  color: string;
  // Desk positions (SVG coordinates)
  desks: { x: number; y: number }[];
  // Label position
  labelPos: { x: number; y: number };
}

const ZONE_LAYOUTS: ZoneLayout[] = [
  {
    id: "orchestrator",
    label: "Orchestrator",
    floor: "400,100 520,160 400,220 280,160",
    color: "rgba(59,130,246,0.08)",
    desks: [{ x: 400, y: 160 }],
    labelPos: { x: 400, y: 130 },
  },
  {
    id: "working",
    label: "At Work",
    floor: "200,180 380,270 380,380 200,290",
    color: "rgba(59,130,246,0.06)",
    desks: [
      { x: 240, y: 210 }, { x: 300, y: 240 }, { x: 360, y: 270 },
      { x: 240, y: 260 }, { x: 300, y: 290 }, { x: 360, y: 320 },
    ],
    labelPos: { x: 290, y: 200 },
  },
  {
    id: "discussion",
    label: "Discussion",
    floor: "420,240 560,310 560,380 420,310",
    color: "rgba(139,92,246,0.06)",
    desks: [
      { x: 450, y: 270 }, { x: 490, y: 290 }, { x: 530, y: 310 },
      { x: 450, y: 320 }, { x: 490, y: 340 },
    ],
    labelPos: { x: 490, y: 255 },
  },
  {
    id: "review",
    label: "Review",
    floor: "580,180 720,250 720,330 580,260",
    color: "rgba(245,158,11,0.06)",
    desks: [
      { x: 610, y: 210 }, { x: 660, y: 235 }, { x: 710, y: 260 },
    ],
    labelPos: { x: 650, y: 195 },
  },
  {
    id: "blocked",
    label: "Attention",
    floor: "580,340 720,410 720,460 580,390",
    color: "rgba(239,68,68,0.06)",
    desks: [
      { x: 610, y: 365 }, { x: 660, y: 390 }, { x: 710, y: 415 },
    ],
    labelPos: { x: 650, y: 350 },
  },
  {
    id: "available",
    label: "Available",
    floor: "80,250 180,300 180,380 80,330",
    color: "rgba(34,197,94,0.06)",
    desks: [
      { x: 110, y: 280 }, { x: 150, y: 300 },
    ],
    labelPos: { x: 130, y: 265 },
  },
];

// ─── Agent position computation ───

function computeAgentPositions(
  agents: Agent[],
  presences: AgentPresence[]
): Map<string, { x: number; y: number; zone: string }> {
  const positions = new Map<string, { x: number; y: number; zone: string }>();
  const zoneAgentCounts: Record<string, number> = {};

  for (const agent of agents) {
    const presence = presences.find((p) => p.agentId === agent.id);
    const zoneId = presence ? getPresenceZone(presence.state) : "away";

    const layout = ZONE_LAYOUTS.find((z) => z.id === zoneId) ?? ZONE_LAYOUTS[5]; // default to available
    const deskIdx = zoneAgentCounts[zoneId] ?? 0;
    zoneAgentCounts[zoneId] = deskIdx + 1;

    const desk = layout.desks[deskIdx % layout.desks.length];
    positions.set(agent.id, { x: desk.x, y: desk.y, zone: zoneId });
  }

  return positions;
}

// ─── SVG Agent Component ───

function SVGAgent({
  agent,
  presence,
  x,
  y,
  signal,
  govSignals,
  focused,
  onClick,
}: {
  agent: Agent;
  presence: AgentPresence | undefined;
  x: number;
  y: number;
  signal: CollaborationSignal | undefined;
  govSignals: GovernanceSignal[];
  focused: boolean;
  onClick: () => void;
}) {
  const config = presence ? getPresenceConfig(presence.state) : null;
  const dotColor = config?.dot === "dot-green" ? "#22c55e" :
    config?.dot === "dot-blue" ? "#3b82f6" :
    config?.dot === "dot-amber" ? "#f59e0b" :
    config?.dot === "dot-red" ? "#ef4444" :
    config?.dot === "bg-violet-500" ? "#8b5cf6" : "#6b7280";

  const hasAlert = govSignals.some((s) => s.severity === "critical" || s.severity === "attention");

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Desk surface */}
      <rect x={x - 28} y={y - 12} width={56} height={24} rx={4}
        fill={focused ? "var(--accent)" : "var(--surface)"} opacity={focused ? 0.9 : 0.7}
        stroke={focused ? "var(--accent)" : "var(--border)"} strokeWidth={focused ? 2 : 1} />

      {/* Agent emoji */}
      <text x={x - 16} y={y + 5} fontSize={16} textAnchor="middle" dominantBaseline="central">
        {agent.emoji}
      </text>

      {/* Agent name */}
      <text x={x + 6} y={y - 1} fontSize={9} fontWeight={600} fill="var(--text)" textAnchor="start" dominantBaseline="central">
        {agent.name.split(" ")[0]}
      </text>

      {/* Status label */}
      <text x={x + 6} y={y + 9} fontSize={7} fill={config?.color ?? "var(--text-quiet)"} textAnchor="start" dominantBaseline="central">
        {config?.label ?? "Unknown"}
      </text>

      {/* Presence dot */}
      <circle cx={x + 24} cy={y - 8} r={4} fill={dotColor} />

      {/* Alert indicator */}
      {hasAlert && (
        <circle cx={x - 24} cy={y - 8} r={4} fill="#ef4444" opacity={0.8} />
      )}

      {/* Collaboration chip */}
      {signal?.discussionSummary && (
        <rect x={x - 24} y={y + 14} width={48} height={10} rx={3} fill="rgba(139,92,246,0.15)" />
      )}
      {signal?.reviewTargetTaskId && (
        <rect x={x - 24} y={y + 14} width={48} height={10} rx={3} fill="rgba(245,158,11,0.15)" />
      )}
      {signal?.blockerSummary && (
        <rect x={x - 24} y={y + 14} width={48} height={10} rx={3} fill="rgba(239,68,68,0.15)" />
      )}
    </g>
  );
}

// ─── Orchestrator SVG ───

function SVGOrchestrator({ x, y, coordination }: { x: number; y: number; coordination: CoordinationState }) {
  return (
    <g>
      {/* Central desk */}
      <rect x={x - 35} y={y - 18} width={70} height={36} rx={6}
        fill="var(--surface)" opacity={0.9} stroke="var(--accent)" strokeWidth={2} />

      {/* Yas Claw emoji */}
      <text x={x - 18} y={y + 2} fontSize={20} textAnchor="middle" dominantBaseline="central">🦀</text>

      {/* Label */}
      <text x={x + 8} y={y - 4} fontSize={10} fontWeight={700} fill="var(--text)" textAnchor="start" dominantBaseline="central">
        Yas Claw
      </text>
      <text x={x + 8} y={y + 8} fontSize={7} fill="var(--text-quiet)" textAnchor="start" dominantBaseline="central">
        Orchestrator
      </text>

      {/* Coordination indicators */}
      {coordination.isCoordinating && (
        <circle cx={x + 30} cy={y - 14} r={5} fill="#3b82f6" opacity={0.8} />
      )}
    </g>
  );
}

// ─── Room walls ───

function SVGRoomWalls() {
  return (
    <g>
      {/* Back wall */}
      <polygon points="80,100 400,10 720,100 720,180 400,250 80,180"
        fill="var(--surface)" stroke="var(--border)" strokeWidth={1} opacity={0.5} />

      {/* Left wall */}
      <polygon points="80,100 80,400 400,470 400,250"
        fill="var(--surface)" stroke="var(--border)" strokeWidth={1} opacity={0.4} />

      {/* Right wall */}
      <polygon points="720,100 720,400 400,470 400,250"
        fill="var(--surface)" stroke="var(--border)" strokeWidth={1} opacity={0.4} />

      {/* Floor */}
      <polygon points="80,180 400,250 720,180 400,100"
        fill="var(--background)" stroke="var(--border)" strokeWidth={1} />
    </g>
  );
}

// ─── Zone floor ───

function SVGZoneFloor({ zone }: { zone: ZoneLayout }) {
  return (
    <g>
      <polygon points={zone.floor} fill={zone.color} stroke="var(--border)" strokeWidth={0.5} opacity={0.8} />
      <text x={zone.labelPos.x} y={zone.labelPos.y} fontSize={8} fontWeight={600}
        fill="var(--text-quiet)" textAnchor="middle" dominantBaseline="central" opacity={0.7}>
        {zone.label}
      </text>
    </g>
  );
}

// ─── Detail panel (preserved from previous phases) ───

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  task_created: { color: "var(--info)", label: "Task created" },
  task_updated: { color: "var(--text-quiet)", label: "Task updated" },
  task_completed: { color: "var(--success)", label: "Task completed" },
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

  // Compute agent positions
  const agentPositions = useMemo(() => computeAgentPositions(agents, presences), [agents, presences]);

  // Summary counts
  const workingCount = presences.filter((p) => p.state === "working").length;
  const discussionCount = presences.filter((p) => p.state === "in_discussion").length;
  const reviewCount = presences.filter((p) => p.state === "in_review" || p.state === "waiting_for_input").length;
  const blockedCount = presences.filter((p) => p.state === "blocked").length;
  const availableCount = presences.filter((p) => p.state === "available").length;
  const awayCount = presences.filter((p) => p.state === "paused" || p.state === "offline").length;

  if (loading) return <PageShell title="Office" description="Loading..."><div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading office...</div></PageShell>;

  const selectedPresence = selectedAgent ? presences.find((p) => p.agentId === selectedAgent.id) : null;

  return (
    <PageShell title="Office" description="Live isometric office — agents, work states, and active operations">
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
        <svg viewBox={`0 0 ${ROOM_W} ${ROOM_H}`} className="w-full h-auto" style={{ maxHeight: "70vh" }}>
          {/* Room structure */}
          <SVGRoomWalls />

          {/* Zone floors */}
          {ZONE_LAYOUTS.map((zone) => (
            <SVGZoneFloor key={zone.id} zone={zone} />
          ))}

          {/* Orchestrator */}
          <SVGOrchestrator x={400} y={160} coordination={coordination} />

          {/* Agents */}
          {agents.map((agent) => {
            const pos = agentPositions.get(agent.id);
            if (!pos) return null;
            const presence = presences.find((p) => p.agentId === agent.id);
            return (
              <SVGAgent
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
