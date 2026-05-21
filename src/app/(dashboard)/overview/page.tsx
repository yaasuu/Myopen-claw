"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Bell,
  ArrowRight,
  ShieldAlert,
  Activity,
  TrendingUp,
  Zap,
  Target,
  BarChart3,
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

function StatusIcon({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="icon-box" style={{ background: `${color}12` }}>
      {children}
    </div>
  );
}

// ─── Command Strip (P6 + P7) ───

function ReadyCircle({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const filled = circ * (pct / 100);
  const color = pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="5" />
      <circle
        cx="26" cy="26" r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{pct}%</text>
    </svg>
  );
}

function CommandStrip({ readyPct, needsApproval, inProgress, doneToday, signals }: {
  readyPct: number;
  needsApproval: number;
  inProgress: number;
  doneToday: number;
  signals: number;
}) {
  const lanes = [
    { label: "Needs Approval", value: needsApproval, href: "/reviews",  color: needsApproval > 0 ? "var(--warning)" : "var(--text-quiet)", icon: Clock },
    { label: "In Progress",    value: inProgress,    href: "/tasks",    color: inProgress > 0 ? "var(--info)" : "var(--text-quiet)",    icon: Zap },
    { label: "Done Today",     value: doneToday,     href: "/tasks",    color: doneToday > 0 ? "var(--success)" : "var(--text-quiet)",  icon: CheckCircle2 },
    { label: "Signals",        value: signals,       href: "/alerts",   color: signals > 0 ? "var(--danger)" : "var(--text-quiet)",     icon: Bell },
  ];
  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-center gap-6 flex-wrap">
        {/* Ready to operate circle */}
        <div className="flex items-center gap-3 pr-6" style={{ borderRight: "1px solid var(--border)" }}>
          <ReadyCircle pct={readyPct} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Ready</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>to operate</p>
          </div>
        </div>
        {/* Lane stats */}
        {lanes.map((lane) => (
          <Link key={lane.label} href={lane.href} className="flex flex-col gap-1 min-w-[90px] hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-1.5">
              <lane.icon className="h-3.5 w-3.5" style={{ color: lane.color }} />
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{lane.label}</span>
            </div>
            <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: lane.color }}>
              {lane.value}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Department Row (P8) ───

const DEPT_CONFIG = [
  { name: "Export-Growth",       emoji: "📦", agentShortId: "export-growth",       href: "/departments" },
  { name: "Ops-Improvement",     emoji: "⚙️",  agentShortId: "ops-improvement",     href: "/departments" },
  { name: "Architecture-Systems",emoji: "🏗️", agentShortId: "architecture-systems", href: "/departments" },
];

function DepartmentRow({ tasks, agents }: { tasks: TaskWithAgent[]; agents: Agent[] }) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  return (
    <div className="surface-card px-5 py-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="icon-box-sm" style={{ background: "var(--accent-soft)" }}>
          <BarChart3 className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
        </div>
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Department Output</span>
        <span className="text-[10px] ml-1" style={{ color: "var(--text-quiet)" }}>— tasks completed this week</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {DEPT_CONFIG.map((dept) => {
          const agent = agents.find((a) => a.short_id === dept.agentShortId);
          const deptTasks = tasks.filter((t) => t.assigned_agent_id === agent?.id);
          const doneThisWeek = deptTasks.filter((t) => t.status === "done" && t.updated_at >= weekAgo).length;
          const inProgress = deptTasks.filter((t) => t.status === "in-progress" || t.status === "dispatched").length;
          const total = deptTasks.length;
          const pct = total > 0 ? Math.round((doneThisWeek / Math.max(total, 1)) * 100) : 0;

          return (
            <Link key={dept.name} href={dept.href}>
              <div className="rounded-lg p-4 hover-surface transition-colors" style={{ border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{dept.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold truncate" style={{ color: "var(--text)" }}>{dept.name}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--text-quiet)" }}>
                      {agent ? agent.name : "No agent"}
                    </p>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>{doneThisWeek}</div>
                    <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-quiet)" }}>done this week</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: inProgress > 0 ? "var(--info)" : "var(--text-quiet)" }}>{inProgress}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-quiet)" }}>in progress</div>
                  </div>
                </div>
                <div className="mt-3 progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] mt-1 text-right" style={{ color: "var(--text-quiet)" }}>{pct}% completion rate</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── CEO Morning Briefing ───

function MorningBriefing({ agents, tasks, blocked, pausedAgents, criticalEvents, events, taskStats }: {
  agents: { id: string; name: string; emoji: string; short_id: string; status: string }[];
  tasks: { id: string; title: string; status: string; priority: string; assigned_agent_id: string | null; blocker: string | null; updated_at: string; assigned_agent_name: string | null; assigned_agent_emoji: string | null }[];
  blocked: typeof tasks;
  pausedAgents: { id: string; name: string; emoji: string }[];
  criticalEvents: { id: string; event_type: string; summary: string; created_at: string }[];
  events: { id: string; event_type: string; summary: string; created_at: string; related_agent_id: string | null }[];
  taskStats: { total: number; pending: number; inProgress: number; blocked: number; done: number };
}) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Overnight summary (completed since yesterday)
  const completedYesterday = tasks.filter((t) => t.status === "done" && t.updated_at?.slice(0, 10) >= yesterday).length;

  // In-review count (from tasks directly, since taskStats doesn't include it)
  const inReviewCount = tasks.filter((t) => t.status === "in-review").length;

  // Time helpers
  function ageLabel(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  // Top priorities for today
  const priorities: { text: string; href: string; color: string }[] = [];

  if (inReviewCount > 0) {
    priorities.push({ text: `Approve ${inReviewCount} review item${inReviewCount > 1 ? "s" : ""}`, href: "/reviews", color: "var(--warning)" });
  }
  if (blocked.length > 0) {
    const oldest = blocked.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())[0];
    priorities.push({ text: `Resolve ${blocked.length} blocker${blocked.length > 1 ? "s" : ""} (oldest ${ageLabel(oldest.updated_at)})`, href: "/tasks", color: "var(--danger)" });
  }
  if (pausedAgents.length > 0) {
    priorities.push({ text: `Check ${pausedAgents.length} paused agent${pausedAgents.length > 1 ? "s" : ""}`, href: "/workforce", color: "var(--warning)" });
  }
  if (taskStats.inProgress > 0) {
    priorities.push({ text: `${taskStats.inProgress} task${taskStats.inProgress > 1 ? "s" : ""} in progress`, href: "/tasks", color: "var(--info)" });
  }

  // Waiting for CEO
  const waitingForCEO: { text: string; href: string; age: string }[] = [];
  const reviewTasks = tasks.filter((t) => t.status === "in-review");
  for (const task of reviewTasks.slice(0, 3)) {
    waitingForCEO.push({ text: task.title, href: "/reviews", age: ageLabel(task.updated_at) });
  }
  for (const task of blocked.filter((t) => t.priority === "high").slice(0, 2)) {
    waitingForCEO.push({ text: `${task.title} (blocked)`, href: "/tasks", age: ageLabel(task.updated_at) });
  }

  // Executive greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="rounded-lg p-4 mb-6" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
      {/* Greeting + overnight */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{greeting}, Yas</p>
          <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>
            {completedYesterday > 0 ? `${completedYesterday} task${completedYesterday > 1 ? "s" : ""} completed since yesterday` : "No completed tasks since yesterday"}
            {blocked.length > 0 ? ` · ${blocked.length} blocked` : ""}
            {inReviewCount > 0 ? ` · ${inReviewCount} awaiting review` : ""}
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: "var(--text-quiet)" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Top priorities */}
      {priorities.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-quiet)" }}>Top Priorities</p>
          <div className="flex flex-col gap-1">
            {priorities.map((p, i) => (
              <Link key={i} href={p.href} className="flex items-center gap-2 text-[11px] p-1.5 rounded hover:opacity-80" style={{ background: "var(--surface)" }}>
                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: p.color }} />
                <span style={{ color: "var(--text)" }}>{p.text}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Waiting for CEO */}
      {waitingForCEO.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-quiet)" }}>Waiting for You</p>
          <div className="flex flex-col gap-1">
            {waitingForCEO.map((item, i) => (
              <Link key={i} href={item.href} className="flex items-center justify-between text-[11px] p-1.5 rounded hover:opacity-80" style={{ background: "var(--surface)" }}>
                <span className="truncate" style={{ color: "var(--text)" }}>{item.text}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ml-2" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>{item.age}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/office" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text-quiet)" }}>Office</Link>
        <Link href="/reviews" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text-quiet)" }}>Reviews</Link>
        <Link href="/tasks" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text-quiet)" }}>Tasks</Link>
        <Link href="/live-feed" className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--surface)", color: "var(--text-quiet)" }}>Feed</Link>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [taskStats, setTaskStats] = useState({ total: 0, pending: 0, inProgress: 0, blocked: 0, done: 0 });
  const [blocked, setBlocked] = useState<TaskWithAgent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<FeedEvent[]>([]);
  const [pausedAgents, setPausedAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [skillCoverage, setSkillCoverage] = useState({ installed: 0, total: 0 });
  const [projectCount, setProjectCount] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [sResult, stats, bResult, eResult, pausedResult, critResult, agentsResult, skillsResult, projResult, tasksResult] = await Promise.all([
        getSystemStatus(),
        getTaskStats(),
        getBlockedTasks(),
        getFeedEvents(5),
        getPausedAgents(),
        getCriticalFeedEvents(3),
        getAgents(),
        getAgentSkills(),
        getProjects(),
        getTasks(),
      ]);

      const errors = [sResult.error, bResult.error, eResult.error, pausedResult.error, critResult.error].filter(Boolean);
      if (errors.length > 0) setError(errors.join("; "));

      setStatus(sResult.data);
      setTaskStats(stats);
      setBlocked(bResult.data);
      setEvents(eResult.data);
      setPausedAgents(pausedResult.data);
      setCriticalEvents(critResult.data);
      setAllAgents(agentsResult.data);

      // Skill coverage
      const totalPossible = agentsResult.data.length * 3; // 3 skills per agent target
      setSkillCoverage({
        installed: skillsResult.data.length,
        total: totalPossible,
      });

      // Project count
      setProjectCount(projResult.data.length);
      setTasks(tasksResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "agents", "feed_events", "system_status"], loadRef);

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <PageShell title="Overview" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading dashboard...
        </div>
      </PageShell>
    );
  }

  if (error && !status) {
    return (
      <PageShell title="Overview" description="Error loading data">
        <div className="surface-card">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load dashboard</p>
              <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{error}</p>
            </div>
            <button onClick={load} className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </div>
      </PageShell>
    );
  }

  const needsAttention = taskStats.blocked > 0 || pausedAgents.length > 0;

  // ── Command strip derived values (P6 + P7) ──
  const today = new Date().toISOString().slice(0, 10);
  const activeAgents = allAgents.filter((a) => a.status === "active").length;
  const readyPct = allAgents.length > 0 ? Math.round((activeAgents / allAgents.length) * 100) : 0;
  const needsApproval = tasks.filter((t) => t.status === "in-review").length;
  const inProgressCount = tasks.filter((t) => t.status === "in-progress" || t.status === "dispatched").length;
  const doneToday = tasks.filter((t) => t.status === "done" && t.updated_at?.slice(0, 10) === today).length;
  const signals = taskStats.blocked + pausedAgents.length;

  // ── Summary cards (P9: skill coverage fix) ──
  const agentsWithSkills = allAgents.length > 0
    ? Math.min(skillCoverage.installed, allAgents.length)
    : 0;

  const summaryCards = [
    {
      label: "System Health",
      value: status?.status === "healthy" ? "Healthy" : status?.status ?? "Unknown",
      sub: status?.checked_at ? `Last check: ${timeAgo(status.checked_at)}` : "No data",
      icon: ShieldAlert,
      color: status?.status === "healthy" ? "var(--success)" : "var(--danger)",
    },
    {
      label: "Active Agents",
      value: `${activeAgents} / ${allAgents.length}`,
      sub: allAgents.length > 0 ? `${readyPct}% operational` : "No agents",
      icon: Bot,
      color: "var(--accent)",
    },
    {
      label: "Skills Installed",
      value: String(skillCoverage.installed),
      sub: agentsWithSkills > 0 ? `Across ${agentsWithSkills} agent${agentsWithSkills !== 1 ? "s" : ""}` : "No skills yet",
      icon: TrendingUp,
      color: "var(--info)",
    },
    {
      label: "Projects",
      value: String(projectCount),
      sub: `${taskStats.total} tasks across projects`,
      icon: CheckCircle2,
      color: "var(--success)",
    },
  ];

  return (
    <PageShell title="Overview" description="Operating summary">
      {error && (
        <div
          className="rounded-lg border px-4 py-2.5 text-xs"
          style={{ borderColor: "rgba(245, 158, 11, 0.2)", background: "rgba(245, 158, 11, 0.06)", color: "var(--warning)" }}
        >
          Some data may be stale: {error}
        </div>
      )}

      {/* Command Strip — P6 + P7 */}
      <CommandStrip
        readyPct={readyPct}
        needsApproval={needsApproval}
        inProgress={inProgressCount}
        doneToday={doneToday}
        signals={signals}
      />

      {/* CEO Morning Briefing */}
      <MorningBriefing
        agents={allAgents}
        tasks={tasks}
        blocked={blocked}
        pausedAgents={pausedAgents}
        criticalEvents={criticalEvents}
        events={events}
        taskStats={taskStats}
      />

      {/* Department Output Row — P8 */}
      {allAgents.length > 0 && (
        <DepartmentRow tasks={tasks} agents={allAgents} />
      )}

      {/* Summary cards — P9 skill coverage fixed */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="surface-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>
                {card.label}
              </span>
              <StatusIcon color={card.color}>
                <card.icon className="h-4 w-4" style={{ color: card.color }} />
              </StatusIcon>
            </div>
            <div className="text-2xl font-bold tracking-tight tabular-nums" style={{ color: card.color }}>
              {card.value}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Attention needed */}
      {needsAttention && (
        <Link href="/alerts" className="block">
          <div className="surface-card border-critical hover:border-warning transition-colors cursor-pointer">
            <div className="flex items-center gap-4 p-4">
              <div className="icon-box" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
                <Bell className="h-4 w-4" style={{ color: "var(--warning)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--warning)" }}>Attention Needed</p>
                <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                  {taskStats.blocked > 0 && `${taskStats.blocked} blocked task${taskStats.blocked !== 1 ? "s" : ""}`}
                  {taskStats.blocked > 0 && pausedAgents.length > 0 && " · "}
                  {pausedAgents.length > 0 && `${pausedAgents.length} paused agent${pausedAgents.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <Badge style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--warning)" }}>
                {taskStats.blocked + pausedAgents.length}
              </Badge>
              <ArrowRight className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
            </div>
          </div>
        </Link>
      )}

      {/* Three-column signal row */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Blocked tasks */}
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="icon-box-sm" style={{ background: "rgba(239, 68, 68, 0.08)" }}>
                  <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Blocked Tasks</span>
              </div>
              {blocked.length > 0 && (
                <Badge style={{ background: "rgba(239, 68, 68, 0.12)", color: "var(--danger)" }}>{blocked.length}</Badge>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {blocked.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                All clear
              </div>
            ) : (
              <div className="space-y-2.5">
                {blocked.slice(0, 3).map((task) => (
                  <div key={task.id} className="rounded-lg p-3 space-y-1.5" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-quiet)" }}>{task.blocker}</p>
                    {task.assigned_agent_name && (
                      <Link href={`/agents/${task.assigned_agent_id}`} className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
                        {task.assigned_agent_emoji} {task.assigned_agent_name}
                      </Link>
                    )}
                  </div>
                ))}
                {blocked.length > 3 && (
                  <Link href="/alerts" className="text-xs hover:underline block text-center pt-1 font-medium" style={{ color: "var(--accent)" }}>
                    View all {blocked.length} blocked →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Paused agents */}
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="icon-box-sm" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
                  <Bot className="h-3.5 w-3.5" style={{ color: "var(--warning)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Paused Agents</span>
              </div>
              {pausedAgents.length > 0 && (
                <Badge style={{ background: "rgba(245, 158, 11, 0.12)", color: "var(--warning)" }}>{pausedAgents.length}</Badge>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {pausedAgents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                All agents active
              </div>
            ) : (
              <div className="space-y-2.5">
                {pausedAgents.map((agent) => (
                  <Link key={agent.id} href={`/agents/${agent.id}`} className="block rounded-lg p-3 hover-surface transition-colors" style={{ border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{agent.name}</p>
                        <p className="text-xs truncate" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-quiet)" }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Critical events */}
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="icon-box-sm" style={{ background: "rgba(59, 130, 246, 0.08)" }}>
                  <ShieldAlert className="h-3.5 w-3.5" style={{ color: "var(--info)" }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Critical Events</span>
              </div>
              {criticalEvents.length > 0 && (
                <Link href="/alerts">
                  <Badge className="cursor-pointer hover:opacity-80 transition-opacity" style={{ background: "rgba(59, 130, 246, 0.12)", color: "var(--info)" }}>
                    {criticalEvents.length}
                  </Badge>
                </Link>
              )}
            </div>
          </div>
          <div className="px-5 pb-5">
            {criticalEvents.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-quiet)" }}>
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
                No critical events
              </div>
            ) : (
              <div className="space-y-2.5">
                {criticalEvents.map((event) => (
                  <div key={event.id} className="rounded-lg p-3 space-y-1" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <p className="text-sm truncate" style={{ color: "var(--text)" }}>{event.summary}</p>
                    <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{timeAgo(event.created_at)}</p>
                  </div>
                ))}
                <Link href="/alerts" className="text-xs hover:underline block text-center pt-1 font-medium" style={{ color: "var(--accent)" }}>
                  View all alerts →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Sessions */}
      {allAgents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="icon-box-sm" style={{ background: "var(--accent-soft)" }}>
              <Bot className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Agent Sessions</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {allAgents.map((agent) => {
              const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id);
              const openCount = agentTasks.filter((t) => t.status !== "done").length;
              return (
                <Link key={agent.id} href={`/agents/${agent.id}`}>
                  <div className="surface-card-hover p-4 cursor-pointer">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative">
                        <span className="text-2xl">{agent.emoji}</span>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${agent.status === "active" ? "dot-green" : agent.status === "paused" ? "dot-amber" : "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{agent.name}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-lg p-2" style={{ background: "var(--surface-muted)" }}>
                        <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{openCount}</div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Tasks</div>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: "var(--surface-muted)" }}>
                        <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{agent.task_count}</div>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Total</div>
                      </div>
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: "var(--text-quiet)" }}>
                      {agent.last_activity ? `Active ${timeAgo(agent.last_activity)}` : "No recent activity"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Activity + System */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="icon-box-sm" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                <Activity className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Recent Activity</span>
            </div>
          </div>
          <div className="px-5 pb-5">
            {events.length === 0 ? (
              <p className="py-4 text-xs" style={{ color: "var(--text-quiet)" }}>No events yet</p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-sm">
                    <span className="w-14 shrink-0 text-xs font-medium tabular-nums" style={{ color: "var(--text-quiet)" }}>
                      {timeAgo(event.created_at)}
                    </span>
                    <span className="flex-1" style={{ color: "var(--text-muted)" }}>{event.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="icon-box-sm" style={{ background: "rgba(255, 255, 255, 0.04)" }}>
                <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>System Status</span>
            </div>
          </div>
          <div className="px-5 pb-5">
            {status?.last_event ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${status.status === "healthy" ? "dot-green" : "dot-red"}`} />
                  <span className="text-sm font-medium capitalize" style={{ color: "var(--text)" }}>{status.status}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                  Last activity: {new Date(status.last_event).toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--text)" }}>{status.open_tasks}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Open</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--danger)" }}>{status.blocked_tasks}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Blocked</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>{status.active_agents}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Active</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="py-4 text-xs" style={{ color: "var(--text-quiet)" }}>No system activity recorded</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
