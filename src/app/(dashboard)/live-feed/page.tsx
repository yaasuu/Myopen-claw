"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  Plus, ArrowRightLeft, CheckCircle2, AlertTriangle, Bot, ShieldAlert,
  ShieldCheck, Pencil, Loader2, RefreshCw, MessageSquare, FileText,
  Search, Lightbulb, Clock, XCircle, RotateCcw, Filter, Radio,
} from "lucide-react";
import { getFeedEvents } from "@/lib/data/feed";
import { getAgents } from "@/lib/data/agents";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { FeedEvent, Agent } from "@/types/dashboard";
import { timeAgo } from "@/lib/utils";

const EVENT_TYPES: FeedEvent["event_type"][] = [
  "task_created",
  "task_updated",
  "task_completed",
  "agent_routed",
  "agent_paused",
  "agent_resumed",
  "system_alert",
  "blocker_detected",
  "blocker_resolved",
];

const iconMap: Record<string, typeof Plus> = {
  task_created: Plus,
  task_updated: Pencil,
  task_completed: CheckCircle2,
  agent_routed: ArrowRightLeft,
  agent_paused: Bot,
  agent_resumed: Bot,
  system_alert: ShieldAlert,
  blocker_detected: AlertTriangle,
  blocker_resolved: ShieldCheck,
  discussion_started: MessageSquare,
  discussion_summary_logged: FileText,
  finding_logged: Search,
  proposal_created: Lightbulb,
  approval_requested: Clock,
  approval_granted: CheckCircle2,
  approval_rejected: XCircle,
  task_returned_for_rework: RotateCcw,
};

const colorMap: Record<string, string> = {
  task_created: "text-blue-500 bg-[rgba(59,130,246,0.08)]",
  task_updated: "text-violet-500 bg-[rgba(139,92,246,0.08)]",
  task_completed: "text-emerald-500 bg-[rgba(16,185,129,0.08)]",
  agent_routed: "text-indigo-500 bg-indigo-50",
  agent_paused: "text-[var(--text-quiet)] bg-gray-50",
  agent_resumed: "text-emerald-500 bg-[rgba(16,185,129,0.08)]",
  system_alert: "text-[var(--danger)] bg-[rgba(239,68,68,0.08)]",
  blocker_detected: "text-[var(--warning)] bg-[rgba(245,158,11,0.08)]",
  blocker_resolved: "text-emerald-500 bg-[rgba(16,185,129,0.08)]",
  discussion_started: "text-blue-500 bg-[rgba(59,130,246,0.08)]",
  discussion_summary_logged: "text-violet-500 bg-[rgba(139,92,246,0.08)]",
  finding_logged: "text-amber-500 bg-[rgba(245,158,11,0.08)]",
  proposal_created: "text-violet-500 bg-[rgba(139,92,246,0.08)]",
  approval_requested: "text-amber-500 bg-[rgba(245,158,11,0.08)]",
  approval_granted: "text-emerald-500 bg-[rgba(16,185,129,0.08)]",
  approval_rejected: "text-[var(--danger)] bg-[rgba(239,68,68,0.08)]",
  task_returned_for_rework: "text-amber-500 bg-[rgba(245,158,11,0.08)]",
};

const typeLabels: Record<string, string> = {
  task_created: "Task Created",
  task_updated: "Task Updated",
  task_completed: "Task Completed",
  agent_routed: "Task Reassigned",
  agent_paused: "Agent Paused",
  agent_resumed: "Agent Resumed",
  system_alert: "System Alert",
  blocker_detected: "Blocker Detected",
  blocker_resolved: "Blocker Resolved",
  discussion_started: "Discussion Started",
  discussion_summary_logged: "Discussion Summary",
  finding_logged: "Finding Logged",
  proposal_created: "Proposal Created",
  approval_requested: "Approval Requested",
  approval_granted: "Approval Granted",
  approval_rejected: "Approval Rejected",
  task_returned_for_rework: "Returned for Rework",
};

export default function LiveFeedPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [eventsResult, agentsResult] = await Promise.all([
        getFeedEvents(50),
        getAgents(),
      ]);
      setEvents(eventsResult.data);
      setAgents(agentsResult.data);
      if (eventsResult.error) setError(eventsResult.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["feed_events", "agents", "tasks"], loadRef);

  useEffect(() => {
    load();
  }, []);

  const filtered = events.filter((e) => {
    if (filterType !== "all" && e.event_type !== filterType) return false;
    if (filterAgent !== "all" && e.related_agent_id !== filterAgent) return false;
    return true;
  });

  // Live = events from last 5 minutes
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const liveCount = events.filter((e) => new Date(e.created_at).getTime() >= fiveMinAgo).length;
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  // Group filtered events by day
  const grouped = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const e of filtered) {
      const day = new Date(e.created_at).toDateString();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  function dayLabel(dateStr: string): string {
    const d = new Date(dateStr);
    const today = new Date();
    const yest  = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yest.toDateString())  return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </div>
      </PageShell>
    );
  }

  if (error && events.length === 0) {
    return (
      <PageShell>
        <div className="rounded-xl border p-5 flex items-center gap-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium">Failed to load events</p>
            <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{error}</p>
          </div>
          <button onClick={load} className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Live Feed</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Real-time event stream from agents and the orchestrator
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
             style={{ borderColor: liveCount > 0 ? "rgba(16,185,129,0.3)" : "var(--border)",
                      background:  liveCount > 0 ? "rgba(16,185,129,0.06)" : "var(--surface)" }}>
          <span className="relative flex h-2 w-2">
            {liveCount > 0 && <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--success)" }} />}
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: liveCount > 0 ? "var(--success)" : "var(--text-quiet)" }} />
          </span>
          <span className="text-xs font-semibold" style={{ color: liveCount > 0 ? "var(--success)" : "var(--text-muted)" }}>
            {liveCount > 0 ? `${liveCount} in last 5min` : "Quiet"}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>
          Some data may be stale: {error}
        </div>
      )}

      {/* ── Filter chips ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
          <button
            onClick={() => setFilterType("all")}
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{
              background: filterType === "all" ? "var(--text)" : "var(--surface-muted)",
              color:      filterType === "all" ? "var(--surface)" : "var(--text-muted)",
            }}
          >
            All events
          </button>
          {EVENT_TYPES.map((t) => {
            const active = filterType === t;
            return (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
                style={{
                  background: active ? "var(--text)" : "var(--surface-muted)",
                  color:      active ? "var(--surface)" : "var(--text-muted)",
                }}
              >
                {typeLabels[t] ?? t}
              </button>
            );
          })}
        </div>

        {agents.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
            <button
              onClick={() => setFilterAgent("all")}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
              style={{
                background: filterAgent === "all" ? "var(--accent)" : "var(--surface-muted)",
                color:      filterAgent === "all" ? "#fff" : "var(--text-muted)",
              }}
            >
              All agents
            </button>
            {agents.map((a) => {
              const active = filterAgent === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setFilterAgent(a.id)}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors flex items-center gap-1"
                  style={{
                    background: active ? "var(--accent)" : "var(--surface-muted)",
                    color:      active ? "#fff" : "var(--text-muted)",
                  }}
                >
                  <span>{a.emoji}</span> {a.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Event timeline (grouped by day) ── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border py-16 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <Radio className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {events.length === 0 ? "No events recorded yet" : "No events match these filters"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
            {events.length === 0 ? "Events will appear here as they happen." : "Try clearing filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, dayEvents]) => (
            <section key={day}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{dayLabel(day)}</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="rounded-xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                {dayEvents.map((event, idx) => {
                  const Icon = (iconMap[event.event_type] ?? Plus) as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                  const colors = colorMap[event.event_type] ?? "text-[var(--text-quiet)] bg-gray-50";
                  const label = typeLabels[event.event_type] ?? event.event_type;
                  const linkedAgent = event.related_agent_id ? agentMap.get(event.related_agent_id) : null;
                  const isRecent = new Date(event.created_at).getTime() >= fiveMinAgo;

                  const inner = (
                    <div className={`flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--surface-muted)] transition-colors ${idx !== dayEvents.length - 1 ? "border-b" : ""}`} style={{ borderColor: "var(--border)" }}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors} relative`}>
                        <Icon className="h-4 w-4" />
                        {isRecent && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--success)" }} />
                            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--success)" }} />
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="text-[10px] shrink-0">{label}</Badge>
                          {linkedAgent && (
                            <span className="text-[11px] flex items-center gap-1 font-medium" style={{ color: "var(--text)" }}>
                              {linkedAgent.emoji} {linkedAgent.name}
                            </span>
                          )}
                          {event.related_task_id && !linkedAgent && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>
                              #{event.related_task_id.slice(0, 8)}
                            </span>
                          )}
                          <span className="text-[10px] ml-auto shrink-0 tabular-nums" style={{ color: "var(--text-quiet)" }}>
                            {timeAgo(event.created_at)}
                          </span>
                        </div>
                        <p className="text-sm leading-snug" style={{ color: "var(--text)" }}>{event.summary}</p>
                        <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>
                          {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {event.source}
                        </p>
                      </div>
                    </div>
                  );

                  return event.related_agent_id ? (
                    <Link key={event.id} href={`/agents/${event.related_agent_id}`} className="block">
                      {inner}
                    </Link>
                  ) : (
                    <div key={event.id}>{inner}</div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
