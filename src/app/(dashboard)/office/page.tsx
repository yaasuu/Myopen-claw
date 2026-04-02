"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Loader2,
  RefreshCw,
  Monitor,
  Activity,
  MessageSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getDepartments } from "@/lib/data/departments";
import { getTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { deriveAgentPresence, getPresenceConfig, type AgentPresence, type PresenceState } from "@/lib/data/presence";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, Department } from "@/types/dashboard";

function timeAgo(iso: string | null): string {
  if (!iso) return "away";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 5) return "active now";
  if (mins < 60) return `${mins}m ago`;
  return `away ${Math.floor(mins / 60)}h`;
}

// ─── Agent placement helpers ───

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

// ─── Compact zone card ───

function ZoneCard({ presence, agent, department }: { presence: AgentPresence; agent: Agent; department: string }) {
  const config = getPresenceConfig(presence.state);
  const openTasks = presence.openTasks ?? 0;
  return (
    <Link href={`/agents/${agent.id}`}>
      <div
        className="rounded-md p-3 transition-all hover:scale-[1.02]"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          opacity: SUBDUED_STATES.includes(presence.state) ? 0.6 : 1,
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
        {openTasks > 0 && (
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-quiet)" }}>
            <span>{openTasks} task{openTasks !== 1 ? "s" : ""}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] font-medium" style={{ color: config?.color ?? "var(--text-quiet)" }}>
            {config?.label ?? presence.state}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
            {presence.lastActivity ? timeAgo(presence.lastActivity) : "—"}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Zone panel ───

function ZonePanel({ zone, zonePresences, presences, agents, allDepts }: {
  zone: OfficeZone;
  zonePresences: AgentPresence[];
  presences: AgentPresence[];
  agents: Agent[];
  allDepts: Department[];
}) {
  const Icon = zone.icon;
  const count = zonePresences.length;
  if (count === 0) {
    return (
      <div
        className="rounded-lg p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4" style={{ color: zone.color }} />
          <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{zone.label}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}
          >
            0
          </span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Empty — no active work here right now</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4" style={{ color: zone.color }} />
        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{zone.label}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ background: zone.color + "20", color: zone.color }}
        >
          {count}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {zonePresences.map((presence) => {
          const agent = agents.find((a) => a.id === presence.agentId)!;
          const dept = allDepts.find((d) => d.slug === (agent as any).department_slug || d.id === (agent as any).department_id);
          const departmentLabel = dept ? dept.name : (agent.short_id === "research-agent" || agent.short_id === "executive-finance" || agent.short_id === "qa-agent" ? "Direct" : "Unassigned");
          return (
            <ZoneCard key={presence.agentId} presence={presence} agent={agent} department={departmentLabel} />
          );
        })}
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
  const [presences, setPresences] = useState<AgentPresence[]>([]);

  async function load() {
    setLoading(true);
    const [a, d, t, e] = await Promise.all([getAgents(), getDepartments(), getTasks(), getFeedEvents(50)]);
    setAgents(a.data);
    setDepartments(d.data);
    setTasks(t.data);

    const presenceList = a.data.map((agent) =>
      deriveAgentPresence(agent, t.data, e.data)
    );
    setPresences(presenceList);
    setLoading(false);
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks"], loadRef);
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

  // Compute summary counts
  const workingCount = presences.filter((p) => WORK_STATES.includes(p.state)).length;
  const discussionCount = presences.filter((p) => DISCUSSION_STATES.includes(p.state)).length;
  const reviewCount = presences.filter((p) => REVIEW_STATES.includes(p.state)).length;
  const blockedCount = presences.filter((p) => BLOCKER_STATES.includes(p.state)).length;
  const availableCount = presences.filter((p) => AVAIL_STATES.includes(p.state)).length;
  const subduedCount = presences.filter((p) => SUBDUED_STATES.includes(p.state)).length;

  return (
    <PageShell title="Office" description="Live view — agents, work states, and active operations">
      {/* Summary strip */}
      <div className="rounded-lg p-3 mb-6 flex flex-wrap gap-4 sm:gap-6 text-xs" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
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
          <div className="h-2 w-2 rounded-full" style={{ background: "var(--danger)" }} />
          <span style={{ color: "var(--text-quiet)" }}>Blocked {blockedCount}</span>
        </div>
        {subduedCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} />
            <span style={{ color: "var(--text-quiet)" }}>Away {subduedCount}</span>
          </div>
        )}
      </div>

      {/* Orchestrator row */}
      <div
        className="rounded-lg p-4 mb-6 text-center"
        style={{ border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-center gap-3 mb-1">
          <span className="text-2xl">🦀</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Yas Claw</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Orchestrator — All Agents</p>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>
          {agents.length} agents · {departments.length} departments · {presences.filter((p) => p.state === "working").length} working now
        </p>
      </div>

      {/* Spatial zones */}
      <div className="flex flex-col gap-4">
        {ZONES.map((zone) => {
          const zonePresences = presences.filter((p) => zone.presenceStates.includes(p.state));
          return (
            <ZonePanel key={zone.id} zone={zone} zonePresences={zonePresences} presences={presences} agents={agents} allDepts={departments} />
          );
        })}
      </div>
    </PageShell>
  );
}