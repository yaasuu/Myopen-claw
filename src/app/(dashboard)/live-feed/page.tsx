"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Bot,
  ShieldAlert,
  ShieldCheck,
  Pencil,
  Archive,
  ArchiveRestore,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getFeedEvents } from "@/lib/data/feed";
import { getAgents } from "@/lib/data/agents";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { FeedEvent, Agent } from "@/types/dashboard";

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
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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

  if (loading) {
    return (
      <PageShell title="Live Feed" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading events...
        </div>
      </PageShell>
    );
  }

  if (error && events.length === 0) {
    return (
      <PageShell title="Live Feed" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load events</p>
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

  // Build a name lookup for linked entities
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <PageShell title="Live Feed" description="Real-time event stream">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {typeLabels[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Badge variant="outline" className="gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full dot-green" />
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          Some data may be stale: {error}
        </div>
      )}

      {/* Event list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {events.length === 0
                ? "No events recorded yet"
                : "No events match the current filters"}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((event) => {
                const Icon = iconMap[event.event_type] ?? Plus;
                const colors = colorMap[event.event_type] ?? "text-[var(--text-quiet)] bg-gray-50";
                const label = typeLabels[event.event_type] ?? event.event_type;
                const linkedAgent = event.related_agent_id ? agentMap.get(event.related_agent_id) : null;

                const hasLink = !!event.related_agent_id;

                const inner = (
                  <div className="flex items-start gap-4 px-5 py-4 hover:bg-muted/50 transition-colors">
                    {/* Icon */}
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {label}
                        </Badge>
                        {linkedAgent && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            {linkedAgent.emoji} {linkedAgent.name}
                          </span>
                        )}
                        {event.related_task_id && !linkedAgent && (
                          <span className="text-xs text-muted-foreground">
                            Task #{event.related_task_id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{event.summary}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{timeAgo(event.created_at)}</span>
                        <span>·</span>
                        <span>{new Date(event.created_at).toLocaleString()}</span>
                        <span>·</span>
                        <span>{event.source}</span>
                      </div>
                    </div>
                  </div>
                );

                if (hasLink) {
                  return (
                    <Link key={event.id} href={`/agents/${event.related_agent_id}`} className="block">
                      {inner}
                    </Link>
                  );
                }

                return <div key={event.id}>{inner}</div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
