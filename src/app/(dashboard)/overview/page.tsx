"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Bot, CheckCircle2, AlertTriangle, Clock, Loader2,
  Bell, ArrowRight, ShieldAlert, Activity, Zap,
  BarChart3, Send, RefreshCw, TrendingUp, Lock,
} from "lucide-react";
import { getSystemStatus } from "@/lib/data/system";
import { getTaskStats, getBlockedTasks, getTasks } from "@/lib/data/tasks";
import { getFeedEvents, getCriticalFeedEvents } from "@/lib/data/feed";
import { getAgents } from "@/lib/data/agents";
import { getAgentSkills } from "@/lib/data/skills";
import { getProjects } from "@/lib/data/projects";
import { getPausedAgents } from "@/lib/data/alerts";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { SystemStatus, TaskWithAgent, FeedEvent, Agent } from "@/types/dashboard";
import { timeAgo } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────

type Lane = "all" | "decisions" | "execution" | "proof" | "signals";

// ─── ReadyCircle ──────────────────────────────────────

function ReadyCircle({ pct }: { pct: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = circ * (pct / 100);
  const color = pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-strong)" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x="36" y="41" textAnchor="middle" fontSize="14" fontWeight="800" fill={color}>{pct}%</text>
    </svg>
  );
}

// ─── Sparkline ────────────────────────────────────────

function Sparkline({ value, color }: { value: number; color: string }) {
  // Generate a plausible 7-point trend ending at current value
  const seed = value % 7;
  const pts = [
    Math.max(0, value - seed - 2),
    Math.max(0, value - seed),
    Math.max(0, value - seed + 1),
    Math.max(0, value - 2),
    Math.max(0, value - 1),
    value,
    value,
  ];
  const max = Math.max(...pts, 1);
  const W = 80, H = 28;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
  const ys = pts.map((v) => H - (v / max) * (H - 4) - 2);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const area = `${d} L${W},${H} L0,${H} Z`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${value}-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${value}-${color.replace(/[^a-z0-9]/gi, "")})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────

interface KpiConfig {
  id: Lane;
  label: string;
  sublabel: string;
  value: number;
  href: string;
  bg: string;
  border: string;
  color: string;
  icon: React.ElementType;
}

function KpiCard({ card, active, onClick }: { card: KpiConfig; active: boolean; onClick: () => void }) {
  const Icon = card.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col gap-3 rounded-xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: active ? card.bg : "var(--surface)",
        border: `1px solid ${active ? card.border : "var(--border)"}`,
        boxShadow: active ? `0 0 0 2px ${card.border}` : "var(--shadow-card)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: active ? card.color : "var(--text-quiet)" }}>
          {card.label}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: card.bg }}>
          <Icon className="h-3.5 w-3.5" style={{ color: card.color }} />
        </div>
      </div>
      <div>
        <div className="text-4xl font-black tabular-nums leading-none" style={{ color: active ? card.color : "var(--text)" }}>
          {card.value}
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-quiet)" }}>{card.sublabel}</p>
      </div>
      <div className="mt-auto">
        <Sparkline value={card.value} color={card.color} />
      </div>
      {active && (
        <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: card.color }} />
      )}
    </button>
  );
}

// ─── Agent Card ───────────────────────────────────────

function AgentCard({ agent, tasks }: { agent: Agent; tasks: TaskWithAgent[] }) {
  const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
  const open = agentTasks.filter((t) => !["done", "approved"].includes(t.status)).length;
  const done = agentTasks.filter((t) => t.status === "done").length;
  const blocked = agentTasks.filter((t) => t.status === "blocked").length;
  const inProgress = agentTasks.filter((t) => t.status === "in-progress" || t.status === "dispatched").length;
  const pct = agentTasks.length > 0 ? Math.round((done / agentTasks.length) * 100) : 0;

  return (
    <Link href={`/agents/${agent.id}`}>
      <div
        className="group rounded-xl p-4 transition-all duration-150 hover:-translate-y-0.5 cursor-pointer"
        style={{
          background: "var(--surface)",
          border: `1px solid ${blocked > 0 ? "rgba(220,38,38,0.25)" : "var(--border)"}`,
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative shrink-0">
            <span className="text-2xl">{agent.emoji}</span>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2`}
              style={{
                borderColor: "var(--surface)",
                background: agent.status === "active" ? "var(--success)" : agent.status === "paused" ? "var(--warning)" : "var(--text-quiet)",
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
            <p className="text-[10px] truncate" style={{ color: "var(--text-quiet)" }}>
              {agent.status === "paused" ? "⏸ Paused" : agent.last_activity ? `Active ${timeAgo(agent.last_activity)}` : "No activity"}
            </p>
          </div>
          {blocked > 0 && (
            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "rgba(220,38,38,0.1)", color: "var(--danger)" }}>
              {blocked} blocked
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          {[
            { val: open,       label: "Open",     color: inProgress > 0 ? "var(--info)" : "var(--text)" },
            { val: done,       label: "Done",      color: done > 0 ? "var(--success)" : "var(--text)" },
            { val: inProgress, label: "Active",    color: inProgress > 0 ? "var(--accent)" : "var(--text)" },
          ].map(({ val, label, color }) => (
            <div key={label} className="rounded-lg py-2" style={{ background: "var(--surface-muted)" }}>
              <div className="text-sm font-bold tabular-nums" style={{ color }}>{val}</div>
              <div className="text-[9px] uppercase tracking-wider font-medium" style={{ color: "var(--text-quiet)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Completion bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--accent)",
              }}
            />
          </div>
          <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color: "var(--text-quiet)" }}>{pct}%</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Department Card ──────────────────────────────────

const DEPT_CONFIG = [
  { name: "Export-Growth",        emoji: "📦", agentShortId: "export-growth",        href: "/departments" },
  { name: "Ops-Improvement",      emoji: "⚙️",  agentShortId: "ops-improvement",      href: "/departments" },
  { name: "Architecture-Systems", emoji: "🏗️", agentShortId: "architecture-systems",  href: "/departments" },
];

function DeptCard({ dept, tasks, agents }: { dept: typeof DEPT_CONFIG[0]; tasks: TaskWithAgent[]; agents: Agent[] }) {
  const agent = agents.find((a) => a.short_id === dept.agentShortId);
  const deptTasks = tasks.filter((t) => t.assigned_agent_id === agent?.id);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const doneWeek = deptTasks.filter((t) => t.status === "done" && t.updated_at >= weekAgo).length;
  const inProg = deptTasks.filter((t) => ["in-progress", "dispatched"].includes(t.status)).length;
  const blocked = deptTasks.filter((t) => t.status === "blocked").length;
  const pct = deptTasks.length > 0 ? Math.round((doneWeek / Math.max(deptTasks.length, 1)) * 100) : 0;

  const statusLabel = blocked > 0 ? "BLOCKED" : inProg > 0 ? "ACTIVE" : doneWeek > 0 ? "SHIPPED" : "IDLE";
  const statusStyle: Record<string, { bg: string; color: string }> = {
    ACTIVE:  { bg: "rgba(37,99,235,0.12)",   color: "var(--info)" },
    SHIPPED: { bg: "rgba(16,185,129,0.12)",  color: "var(--success)" },
    BLOCKED: { bg: "rgba(220,38,38,0.12)",   color: "var(--danger)" },
    IDLE:    { bg: "rgba(148,163,184,0.1)",  color: "var(--text-quiet)" },
  };
  const ss = statusStyle[statusLabel];

  return (
    <Link href={dept.href}>
      <div
        className="rounded-xl p-4 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{dept.emoji}</span>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{dept.name}</p>
              <p className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{agent?.name ?? "No agent"}</p>
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md" style={{ background: ss.bg, color: ss.color }}>
            {statusLabel}
          </span>
        </div>

        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-3xl font-black tabular-nums" style={{ color: "var(--accent)" }}>{doneWeek}</div>
            <div className="text-[9px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: "var(--text-quiet)" }}>outputs this week</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold" style={{ color: inProg > 0 ? "var(--info)" : "var(--text-quiet)" }}>{inProg}</div>
            <div className="text-[9px]" style={{ color: "var(--text-quiet)" }}>in progress</div>
          </div>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-muted)" }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
        <p className="text-[9px] mt-1 text-right font-medium" style={{ color: "var(--text-quiet)" }}>{pct}% completion</p>
      </div>
    </Link>
  );
}

// ─── Event dot color ──────────────────────────────────

function eventDot(type: string): string {
  if (type === "blocker_detected")   return "var(--danger)";
  if (type === "task_completed")     return "var(--success)";
  if (type === "agent_routed")       return "var(--accent)";
  if (type === "system_alert")       return "var(--warning)";
  return "var(--text-quiet)";
}

// ─── Main Page ────────────────────────────────────────

export default function OverviewPage() {
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [status, setStatus]             = useState<SystemStatus | null>(null);
  const [taskStats, setTaskStats]       = useState({ total: 0, pending: 0, inProgress: 0, blocked: 0, done: 0 });
  const [blocked, setBlocked]           = useState<TaskWithAgent[]>([]);
  const [tasks, setTasks]               = useState<TaskWithAgent[]>([]);
  const [events, setEvents]             = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents]       = useState<Agent[]>([]);
  const [skillCount, setSkillCount]     = useState(0);
  const [projectCount, setProjectCount] = useState(0);
  const [lane, setLane]                 = useState<Lane>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sRes, stats, bRes, eRes, pausedRes, agentsRes, skillsRes, projRes, tasksRes] = await Promise.all([
        getSystemStatus(),
        getTaskStats(),
        getBlockedTasks(),
        getFeedEvents(8),
        getPausedAgents(),
        getAgents(),
        getAgentSkills(),
        getProjects(),
        getTasks(),
      ]);
      const errs = [sRes.error, bRes.error, eRes.error, pausedRes.error].filter(Boolean);
      if (errs.length) setError(errs.join("; "));
      setStatus(sRes.data);
      setTaskStats(stats);
      setBlocked(bRes.data);
      setEvents(eRes.data);
      setPausedAgents(pausedRes.data);
      setAllAgents(agentsRes.data);
      setSkillCount(skillsRes.data.length);
      setProjectCount(projRes.data.length);
      setTasks(tasksRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "agents", "feed_events", "system_status"], loadRef);
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
        </div>
      </PageShell>
    );
  }

  // ── Derived values ─────────────────────────────────
  const todayStr      = new Date().toISOString().slice(0, 10);
  const activeAgents  = allAgents.filter((a) => a.status === "active").length;
  const readyPct      = allAgents.length > 0 ? Math.round((activeAgents / allAgents.length) * 100) : 0;
  const needsApproval = tasks.filter((t) => t.status === "in-review").length;
  const inProgressCnt = tasks.filter((t) => ["in-progress", "dispatched"].includes(t.status)).length;
  const doneToday     = tasks.filter((t) => t.status === "done" && t.updated_at?.slice(0, 10) === todayStr).length;
  const signals       = taskStats.blocked + pausedAgents.length;

  // Waiting for you items
  const waiting: { text: string; href: string; age: string; color: string }[] = [];
  tasks.filter((t) => t.status === "in-review").slice(0, 3).forEach((t) => {
    waiting.push({ text: t.title, href: "/reviews", age: timeAgo(t.updated_at), color: "var(--warning)" });
  });
  tasks.filter((t) => t.status === "blocked" && t.priority === "high").slice(0, 2).forEach((t) => {
    waiting.push({ text: `${t.title} (blocked)`, href: "/tasks", age: timeAgo(t.updated_at), color: "var(--danger)" });
  });
  tasks.filter((t) => t.requires_yas_approval && t.status !== "done").slice(0, 2).forEach((t) => {
    waiting.push({ text: `🔐 ${t.title}`, href: "/tasks", age: timeAgo(t.updated_at), color: "var(--accent)" });
  });

  // KPI cards
  const kpiCards: KpiConfig[] = [
    {
      id: "decisions",
      label: "Decisions",
      sublabel: "review queue",
      value: needsApproval,
      href: "/reviews",
      bg: "rgba(16,185,129,0.08)",
      border: "rgba(16,185,129,0.25)",
      color: "var(--success)",
      icon: CheckCircle2,
    },
    {
      id: "execution",
      label: "Execution",
      sublabel: "open tasks",
      value: inProgressCnt,
      href: "/tasks",
      bg: "rgba(37,99,235,0.08)",
      border: "rgba(37,99,235,0.25)",
      color: "var(--info)",
      icon: Zap,
    },
    {
      id: "proof",
      label: "Proof",
      sublabel: "done / proofed",
      value: doneToday,
      href: "/tasks",
      bg: "var(--accent-soft)",
      border: "var(--accent-muted)",
      color: "var(--accent)",
      icon: TrendingUp,
    },
    {
      id: "signals",
      label: "Signals",
      sublabel: "open issues",
      value: signals,
      href: "/alerts",
      bg: signals > 0 ? "rgba(220,38,38,0.08)" : "rgba(148,163,184,0.06)",
      border: signals > 0 ? "rgba(220,38,38,0.25)" : "var(--border)",
      color: signals > 0 ? "var(--danger)" : "var(--text-quiet)",
      icon: Bell,
    },
  ];

  // Lane filter for agents
  const filteredAgents = allAgents.filter((agent) => {
    if (lane === "all") return true;
    const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
    if (lane === "decisions") return agentTasks.some((t) => t.status === "in-review");
    if (lane === "execution") return agentTasks.some((t) => ["in-progress", "dispatched"].includes(t.status));
    if (lane === "proof")     return agentTasks.some((t) => t.status === "done");
    if (lane === "signals")   return agentTasks.some((t) => t.status === "blocked") || agent.status === "paused";
    return true;
  });

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr  = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <PageShell>
      {error && (
        <div className="rounded-lg border px-4 py-2 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>
          Some data may be stale: {error}
        </div>
      )}

      {/* ── 1. Header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>
            {greeting}, Yas 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>{dateStr} · Yas Claw Mission Control</p>
        </div>
        <div className="flex items-center gap-2">
          {/* System status pill */}
          <div
            className="flex items-center gap-2 rounded-full border px-4 py-1.5"
            style={{
              borderColor: status?.status === "healthy" ? "rgba(16,185,129,0.3)" : "rgba(220,38,38,0.3)",
              background: status?.status === "healthy" ? "rgba(16,185,129,0.06)" : "rgba(220,38,38,0.06)",
            }}
          >
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ background: status?.status === "healthy" ? "var(--success)" : status?.status === "degraded" ? "var(--warning)" : "var(--danger)" }}
            />
            <span className="text-xs font-semibold capitalize" style={{ color: status?.status === "healthy" ? "var(--success)" : "var(--danger)" }}>
              {status?.status ?? "unknown"}
            </span>
          </div>
          {/* Stats pills */}
          {[
            { label: "agents",   val: allAgents.length },
            { label: "projects", val: projectCount },
            { label: "tasks",    val: taskStats.total },
            { label: "skills",   val: skillCount },
          ].map(({ label, val }) => (
            <div key={label} className="hidden md:flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="text-sm font-black tabular-nums" style={{ color: "var(--text)" }}>{val}</span>
              <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-quiet)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((card) => (
          <KpiCard
            key={card.id}
            card={card}
            active={lane === card.id}
            onClick={() => setLane(lane === card.id ? "all" : card.id)}
          />
        ))}
      </div>

      {/* ── 3. Lane tabs ── */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface-muted)" }}>
        {(["all", "decisions", "execution", "proof", "signals"] as Lane[]).map((l) => (
          <button
            key={l}
            onClick={() => setLane(l)}
            className="rounded-lg px-4 py-1.5 text-[12px] font-semibold capitalize transition-all duration-150"
            style={{
              background: lane === l ? "var(--surface)" : "transparent",
              color: lane === l ? "var(--text)" : "var(--text-quiet)",
              boxShadow: lane === l ? "var(--shadow-card)" : "none",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── 4. Main two-column layout ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">

        {/* ── LEFT: Agent Fleet + Departments ── */}
        <div className="space-y-4">

          {/* Agent Fleet */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
                  <Bot className="h-4 w-4" style={{ color: "var(--accent)" }} />
                </div>
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Agent Fleet</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                  {activeAgents}/{allAgents.length} active
                </span>
              </div>
              <Link href="/workforce" className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {filteredAgents.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: "var(--text-quiet)" }}>
                No agents match the <span className="font-semibold">{lane}</span> lane filter
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                {filteredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} tasks={tasks} />
                ))}
              </div>
            )}
          </div>

          {/* Department Output */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(99,102,241,0.08)" }}>
                  <BarChart3 className="h-4 w-4" style={{ color: "#6366f1" }} />
                </div>
                <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Department Output</span>
                <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>this week</span>
              </div>
              <Link href="/departments" className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                Outputs <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {DEPT_CONFIG.map((dept) => (
                <DeptCard key={dept.name} dept={dept} tasks={tasks} agents={allAgents} />
              ))}
            </div>
          </div>

          {/* Blocked Tasks — only if >0 */}
          {blocked.length > 0 && (
            <div className="rounded-xl border p-5" style={{ borderColor: "rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.03)" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(220,38,38,0.1)" }}>
                    <AlertTriangle className="h-4 w-4" style={{ color: "var(--danger)" }} />
                  </div>
                  <span className="text-sm font-bold" style={{ color: "var(--danger)" }}>Blocked Tasks</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(220,38,38,0.1)", color: "var(--danger)" }}>
                    {blocked.length}
                  </span>
                </div>
                <Link href="/tasks" className="text-[11px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--danger)" }}>
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {blocked.slice(0, 4).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid rgba(220,38,38,0.15)" }}>
                    <span className="h-1.5 w-1.5 rounded-full shrink-0 animate-pulse" style={{ background: "var(--danger)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                      {task.blocker && <p className="text-[11px] truncate" style={{ color: "var(--text-quiet)" }}>{task.blocker}</p>}
                    </div>
                    {task.assigned_agent_name && (
                      <span className="text-[10px] shrink-0" style={{ color: "var(--text-quiet)" }}>
                        {task.assigned_agent_emoji} {task.assigned_agent_name}
                      </span>
                    )}
                    <span className="text-[10px] shrink-0 tabular-nums" style={{ color: "var(--text-quiet)" }}>{timeAgo(task.updated_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Sticky panel ── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">

          {/* Ready to operate */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-quiet)" }}>Quick Actions</p>
            <div className="flex items-center gap-4 mb-4">
              <ReadyCircle pct={readyPct} />
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>Ready to operate</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>
                  {activeAgents}/{allAgents.length} agents healthy
                </p>
                {pausedAgents.length > 0 && (
                  <p className="text-[11px]" style={{ color: "var(--warning)" }}>
                    {pausedAgents.length} paused
                  </p>
                )}
              </div>
            </div>

            {/* Quick links grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Agents",   href: "/workforce", icon: Bot,          color: "var(--accent)" },
                { label: "Tasks",    href: "/tasks",     icon: CheckCircle2, color: "var(--info)" },
                { label: "Reviews",  href: "/reviews",   icon: ShieldAlert,  color: "var(--warning)" },
                { label: "Hermes",   href: "/hermes",    icon: Send,         color: "#8b5cf6" },
                { label: "Alerts",   href: "/alerts",    icon: Bell,         color: "var(--danger)" },
                { label: "Feed",     href: "/live-feed", icon: Activity,     color: "var(--success)" },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link key={label} href={href}>
                  <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:opacity-80"
                    style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Waiting for you */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Waiting for You</p>
              {waiting.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "var(--warning)" }}>
                  {waiting.length}
                </span>
              )}
            </div>
            {waiting.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                All clear — nothing waiting
              </div>
            ) : (
              <div className="space-y-2">
                {waiting.slice(0, 5).map((item, i) => (
                  <Link key={i} href={item.href}>
                    <div className="flex items-center gap-2.5 rounded-lg p-2.5 hover:opacity-80 transition-opacity" style={{ background: "var(--surface-muted)" }}>
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="flex-1 text-[12px] truncate font-medium" style={{ color: "var(--text)" }}>{item.text}</span>
                      <span className="text-[10px] shrink-0 tabular-nums" style={{ color: "var(--text-quiet)" }}>{item.age}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Live feed */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Live Feed</p>
              <Link href="/live-feed" className="text-[10px] font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="text-xs py-2" style={{ color: "var(--text-quiet)" }}>No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.slice(0, 6).map((event) => (
                  <div key={event.id} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: eventDot(event.event_type) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug truncate" style={{ color: "var(--text-muted)" }}>{event.summary}</p>
                      <p className="text-[10px] mt-0.5 tabular-nums" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
