"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Loader2,
  Monitor,
  Activity,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  ShieldCheck,
  ExternalLink,
  X,
  ListTodo,
  Users,
  Radio,
} from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getDepartments } from "@/lib/data/departments";
import { getTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { deriveAgentPresence, getPresenceConfig, type AgentPresence, type PresenceState } from "@/lib/data/presence";
import { computeCollaborationSignals, computeCoordinationState, type CollaborationSignal, type CoordinationState } from "@/lib/data/collaboration";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, Department, FeedEvent } from "@/types/dashboard";

function timeAgo(iso: string | null): string {
  if (!iso) return "away";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "active now";
  if (mins < 60) return `${mins}m ago`;
  return `away ${Math.floor(mins / 60)}h`;
}

// ─── Zone definitions ───

const WORK_STATES: PresenceState[] = ["working"];
const DISCUSSION_STATES: PresenceState[] = ["in_discussion"];
const REVIEW_STATES: PresenceState[] = ["in_review", "waiting_for_input"];
const BLOCKER_STATES: PresenceState[] = ["blocked"];
const AVAIL_STATES: PresenceState[] = ["available"];
const SUBDUED_STATES: PresenceState[] = ["paused", "offline"];

interface OfficeZone {
  id: string;
  label: string;
  icon: typeof Activity;
  description: string;
  color: string;
  presenceStates: PresenceState[];
}

const ZONES: OfficeZone[] = [
  { id: "working", label: "At Work", icon: Activity, description: "Actively working on tasks", color: "var(--info)", presenceStates: WORK_STATES },
  { id: "discussion", label: "Discussion", icon: MessageSquare, description: "In active discussion", color: "var(--accent)", presenceStates: DISCUSSION_STATES },
  { id: "review", label: "Awaiting Review", icon: Clock, description: "Waiting for review or approval", color: "var(--warning)", presenceStates: REVIEW_STATES },
  { id: "blockers", label: "Blocked", icon: AlertTriangle, description: "Blocked or needs attention", color: "var(--danger)", presenceStates: BLOCKER_STATES },
  { id: "available", label: "Available", icon: CheckCircle2, description: "No active work, ready", color: "var(--success)", presenceStates: AVAIL_STATES },
  { id: "subdued", label: "Away", icon: Monitor, description: "Paused or offline", color: "var(--text-muted)", presenceStates: SUBDUED_STATES },
];

// ─── Collaboration context chip ───

function ContextChip({ signal, tasks }: { signal: CollaborationSignal | undefined; tasks: TaskWithAgent[] }) {
  if (!signal) return null;
  if (signal.discussionSummary) {
    return (
      <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.1)", color: "var(--accent)" }}>
        <MessageSquare className="h-2.5 w-2.5" />
        <span className="truncate">{signal.discussionSummary.slice(0, 40)}{signal.discussionSummary.length > 40 ? "…" : ""}</span>
      </div>
    );
  }
  if (signal.blockerSummary) {
    return (
      <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
        <AlertTriangle className="h-2.5 w-2.5" />
        <span className="truncate">{signal.blockerSummary.slice(0, 40)}{signal.blockerSummary.length > 40 ? "…" : ""}</span>
      </div>
    );
  }
  if (signal.reviewTargetTaskId) {
    const task = tasks.find((t) => t.id === signal.reviewTargetTaskId);
    return (
      <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
        <ShieldCheck className="h-2.5 w-2.5" />
        <span>Review: {task?.title?.slice(0, 30) ?? "pending"}{task && task.title.length > 30 ? "…" : ""}</span>
      </div>
    );
  }
  if (signal.isRouted && signal.routedBy) {
    return (
      <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.08)", color: "var(--info)" }}>
        <GitBranch className="h-2.5 w-2.5" />
        <span>Routed by {signal.routedBy}</span>
      </div>
    );
  }
  return null;
}

// ─── Quick link button ───

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof Activity; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded hover:opacity-80 transition-opacity" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </Link>
  );
}

// ─── Detail panel (side panel when agent is clicked) ───

function AgentDetailPanel({
  agent,
  presence,
  signal,
  tasks,
  events,
  departments,
  onClose,
}: {
  agent: Agent;
  presence: AgentPresence;
  signal: CollaborationSignal | undefined;
  tasks: TaskWithAgent[];
  events: FeedEvent[];
  departments: Department[];
  onClose: () => void;
}) {
  const config = getPresenceConfig(presence.state);
  const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id && t.status !== "done");
  const agentEvents = events.filter((e) => e.related_agent_id === agent.id).slice(0, 5);
  const dept = departments.find((d) => d.slug === (agent as any).department_slug || d.id === (agent as any).department_id);
  const departmentLabel = dept
    ? dept.name
    : ["research-agent", "executive-finance", "qa-agent"].includes(agent.short_id) ? "Direct" : "Unassigned";

  return (
    <div
      className="fixed right-0 top-0 h-full z-50 overflow-y-auto"
      style={{
        width: "min(360px, 90vw)",
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "0 0 20px rgba(0,0,0,0.1)",
      }}
    >
      {/* Header */}
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
        <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-quiet)" }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Status */}
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-2 w-2 rounded-full ${config?.dot ?? "dot-gray"}`} />
          <span className="text-xs font-semibold" style={{ color: config?.color ?? "var(--text-quiet)" }}>
            {config?.label ?? presence.state}
          </span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
          Last activity: {presence.lastActivity ? timeAgo(presence.lastActivity) : "None"}
        </p>
      </div>

      {/* Current tasks */}
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Open Tasks</p>
        {agentTasks.length === 0 ? (
          <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No active tasks</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {agentTasks.slice(0, 5).map((task) => (
              <Link key={task.id} href={`/tasks`} className="flex items-center gap-2 text-[11px] p-2 rounded hover:opacity-80" style={{ background: "var(--surface-muted)" }}>
                <ListTodo className="h-3 w-3" style={{ color: "var(--text-quiet)" }} />
                <span className="flex-1 truncate" style={{ color: "var(--text)" }}>{task.title}</span>
                <span className="text-[10px] px-1 rounded" style={{
                  background: task.status === "in-review" ? "rgba(245,158,11,0.15)" : task.status === "blocked" ? "rgba(239,68,68,0.15)" : "var(--surface-muted)",
                  color: task.status === "in-review" ? "var(--warning)" : task.status === "blocked" ? "var(--danger)" : "var(--text-quiet)",
                }}>
                  {task.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent events */}
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Recent Activity</p>
        {agentEvents.length === 0 ? (
          <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No recent events</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {agentEvents.map((event) => (
              <div key={event.id} className="p-2 rounded text-[10px]" style={{ background: "var(--surface-muted)" }}>
                <span style={{ color: "var(--text)" }}>{event.summary}</span>
                <p className="mt-0.5" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-quiet)" }}>Quick Links</p>
        <div className="flex flex-wrap gap-2">
          <QuickLink href={`/agents/${agent.id}`} icon={Users} label="Workforce" />
          <QuickLink href="/tasks" icon={ListTodo} label="Tasks" />
          <QuickLink href="/reviews" icon={ShieldCheck} label="Reviews" />
          <QuickLink href="/live-feed" icon={Radio} label="Feed" />
        </div>
      </div>
    </div>
  );
}

// ─── Agent card (click to expand detail panel) ───

function AgentCard({
  presence,
  agent,
  department,
  signal,
  tasks,
  isBlocked,
  onClick,
}: {
  presence: AgentPresence;
  agent: Agent;
  department: string;
  signal: CollaborationSignal | undefined;
  tasks: TaskWithAgent[];
  isBlocked: boolean;
  onClick: () => void;
}) {
  const config = getPresenceConfig(presence.state);
  const openTasks = presence.openTasks ?? 0;

  return (
    <div
      className="rounded-md p-3 cursor-pointer transition-all hover:scale-[1.01]"
      onClick={onClick}
      style={{
        background: isBlocked ? "rgba(239,68,68,0.04)" : "var(--surface)",
        border: isBlocked ? "1px solid rgba(239,68,68,0.2)" : "1px solid var(--border)",
        opacity: SUBDUED_STATES.includes(presence.state) ? 0.55 : 1,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{agent.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
          <p className="text-[10px] truncate" style={{ color: "var(--text-quiet)" }}>{department}</p>
        </div>
        <div className={`h-2 w-2 rounded-full ${config?.dot ?? "dot-gray"}`} />
      </div>
      {signal && (
        <div className="mb-2">
          <ContextChip signal={signal} tasks={tasks} />
        </div>
      )}
      {openTasks > 0 && (
        <div className="flex items-center gap-3 text-[10px] mb-2" style={{ color: "var(--text-quiet)" }}>
          <span>{openTasks} task{openTasks !== 1 ? "s" : ""}</span>
          {presence.inReviewTasks > 0 && <span style={{ color: "var(--warning)" }}>{presence.inReviewTasks} review</span>}
          {presence.blockedTasks > 0 && <span style={{ color: "var(--danger)" }}>{presence.blockedTasks} blocked</span>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: config?.color ?? "var(--text-quiet)" }}>
          {config?.label ?? presence.state}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
          {presence.lastActivity ? timeAgo(presence.lastActivity) : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Zone panel ───

function ZonePanel({
  zone,
  zonePresences,
  agents,
  allDepts,
  signals,
  tasks,
  onSelectAgent,
}: {
  zone: OfficeZone;
  zonePresences: AgentPresence[];
  agents: Agent[];
  allDepts: Department[];
  signals: Map<string, CollaborationSignal>;
  tasks: TaskWithAgent[];
  onSelectAgent: (agent: Agent) => void;
}) {
  const Icon = zone.icon;
  const count = zonePresences.length;

  if (count === 0) {
    return (
      <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4" style={{ color: zone.color }} />
          <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{zone.label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>0</span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>No agents here right now</p>
      </div>
    );
  }

  const isBlockedZone = zone.id === "blockers";

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: isBlockedZone ? "rgba(239,68,68,0.02)" : "var(--surface)",
        border: isBlockedZone ? "1px solid rgba(239,68,68,0.15)" : "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4" style={{ color: zone.color }} />
        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{zone.label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: zone.color + "20", color: zone.color }}>{count}</span>
        {zone.id === "discussion" && <span className="text-[10px] ml-auto" style={{ color: "var(--text-quiet)" }}>active discussion</span>}
        {isBlockedZone && <span className="text-[10px] ml-auto" style={{ color: "var(--danger)" }}>needs attention</span>}
        {zone.id === "review" && <Link href="/reviews" className="text-[10px] ml-auto hover:underline" style={{ color: "var(--warning)" }}>view all reviews →</Link>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {zonePresences.map((presence) => {
          const agent = agents.find((a) => a.id === presence.agentId)!;
          const dept = allDepts.find((d) => d.slug === (agent as any).department_slug || d.id === (agent as any).department_id);
          const departmentLabel = dept
            ? dept.name
            : ["research-agent", "executive-finance", "qa-agent"].includes(agent.short_id) ? "Direct" : "Unassigned";
          return (
            <AgentCard
              key={presence.agentId}
              presence={presence}
              agent={agent}
              department={departmentLabel}
              signal={signals.get(agent.id)}
              tasks={tasks}
              isBlocked={isBlockedZone}
              onClick={() => onSelectAgent(agent)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Orchestrator panel ───

function OrchestratorRow({ agents, departments, workingCount, coordination }: {
  agents: Agent[];
  departments: Department[];
  workingCount: number;
  coordination: CoordinationState;
}) {
  return (
    <div className="rounded-lg p-4 mb-6" style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦀</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Yas Claw</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Orchestrator</p>
          </div>
        </div>
        {/* Quick links */}
        <div className="flex gap-2">
          <QuickLink href="/reviews" icon={ShieldCheck} label="Reviews" />
          <QuickLink href="/tasks" icon={ListTodo} label="Tasks" />
          <QuickLink href="/live-feed" icon={Radio} label="Feed" />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[11px]" style={{ color: "var(--text-quiet)" }}>
          {agents.length} agents · {departments.length} departments · {workingCount} working now
        </span>
        {coordination.isCoordinating && (
          <div className="flex gap-2 ml-auto">
            {coordination.recentRoutes.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "rgba(59,130,246,0.1)", color: "var(--info)" }}>
                <GitBranch className="h-2.5 w-2.5" />
                {coordination.recentRoutes.length} routing{coordination.recentRoutes.length > 1 ? "s" : ""}
              </span>
            )}
            {coordination.pendingReviews.length > 0 && (
              <Link href="/reviews" className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 hover:opacity-80" style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
                <ShieldCheck className="h-2.5 w-2.5" />
                {coordination.pendingReviews.length} pending review{coordination.pendingReviews.length > 1 ? "s" : ""}
              </Link>
            )}
            {coordination.activeDiscussions.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "rgba(139,92,246,0.1)", color: "var(--accent)" }}>
                <MessageSquare className="h-2.5 w-2.5" />
                {coordination.activeDiscussions.length} discussion{coordination.activeDiscussions.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
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
  const [presences, setPresences] = useState<AgentPresence[]>([]);
  const [signals, setSignals] = useState<Map<string, CollaborationSignal>>(new Map());
  const [coordination, setCoordination] = useState<CoordinationState>({
    isCoordinating: false, recentRoutes: [], pendingReviews: [], activeDiscussions: [],
  });
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  async function load() {
    setLoading(true);
    const [a, d, t, e] = await Promise.all([getAgents(), getDepartments(), getTasks(), getFeedEvents(50)]);
    setAgents(a.data);
    setDepartments(d.data);
    setTasks(t.data);
    setEvents(e.data);

    const presenceList = a.data.map((agent) => deriveAgentPresence(agent, t.data, e.data));
    setPresences(presenceList);

    const agentIds = a.data.map((agent) => agent.id);
    const collabSignals = computeCollaborationSignals(e.data, agentIds);
    setSignals(collabSignals);
    setCoordination(computeCoordinationState(e.data, agentIds));

    setLoading(false);
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks", "feed_events"], loadRef);

  useEffect(() => {
    const interval = setInterval(() => load(), 10000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <PageShell title="Office" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading office...
        </div>
      </PageShell>
    );
  }

  const workingCount = presences.filter((p) => WORK_STATES.includes(p.state)).length;
  const discussionCount = presences.filter((p) => DISCUSSION_STATES.includes(p.state)).length;
  const reviewCount = presences.filter((p) => REVIEW_STATES.includes(p.state)).length;
  const blockedCount = presences.filter((p) => BLOCKER_STATES.includes(p.state)).length;
  const availableCount = presences.filter((p) => AVAIL_STATES.includes(p.state)).length;
  const subduedCount = presences.filter((p) => SUBDUED_STATES.includes(p.state)).length;

  // Selected agent data
  const selectedPresence = selectedAgent ? presences.find((p) => p.agentId === selectedAgent.id) : null;

  return (
    <PageShell title="Office" description="Live view — agents, work states, and active operations">
      {/* Summary strip */}
      <div className="rounded-lg p-3 mb-6 flex flex-wrap items-center gap-4 sm:gap-6 text-xs" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />
          <span style={{ color: "var(--text-quiet)" }}>Online {availableCount + workingCount + discussionCount + reviewCount + blockedCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: "var(--info)" }} />
          <span style={{ color: "var(--text-quiet)" }}>At Work {workingCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          <span style={{ color: "var(--text-quiet)" }}>In Discussion {discussionCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} />
          <span style={{ color: "var(--text-quiet)" }}>Awaiting Review {reviewCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ color: "var(--danger)" }} />
          <span style={{ color: "var(--text-quiet)" }}>Blocked {blockedCount}</span>
        </div>
        {subduedCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} />
            <span style={{ color: "var(--text-quiet)" }}>Away {subduedCount}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
          <span style={{ color: "var(--text-quiet)" }}>live</span>
        </div>
      </div>

      {/* Orchestrator */}
      <OrchestratorRow
        agents={agents}
        departments={departments}
        workingCount={workingCount}
        coordination={coordination}
      />

      {/* Spatial zones */}
      <div className="flex flex-col gap-4">
        {ZONES.map((zone) => {
          const zonePresences = presences.filter((p) => zone.presenceStates.includes(p.state));
          return (
            <ZonePanel
              key={zone.id}
              zone={zone}
              zonePresences={zonePresences}
              agents={agents}
              allDepts={departments}
              signals={signals}
              tasks={tasks}
              onSelectAgent={setSelectedAgent}
            />
          );
        })}
      </div>

      {/* Detail side panel */}
      {selectedAgent && selectedPresence && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.15)" }}
            onClick={() => setSelectedAgent(null)}
          />
          <AgentDetailPanel
            agent={selectedAgent}
            presence={selectedPresence}
            signal={signals.get(selectedAgent.id)}
            tasks={tasks}
            events={events}
            departments={departments}
            onClose={() => setSelectedAgent(null)}
          />
        </>
      )}
    </PageShell>
  );
}
