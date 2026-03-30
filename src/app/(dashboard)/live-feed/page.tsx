"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getFeedEvents } from "@/lib/data/feed";
import type { FeedEvent } from "@/types/dashboard";

const iconMap: Record<string, typeof Plus> = {
  task_created: Plus,
  task_updated: ArrowRight,
  task_completed: CheckCircle2,
  agent_routed: ArrowRight,
  agent_paused: Bot,
  agent_resumed: Bot,
  system_alert: AlertTriangle,
  blocker_detected: AlertTriangle,
  blocker_resolved: CheckCircle2,
};

const colorMap: Record<string, string> = {
  task_created: "text-blue-500",
  task_updated: "text-violet-500",
  task_completed: "text-emerald-500",
  agent_routed: "text-violet-500",
  agent_paused: "text-gray-500",
  agent_resumed: "text-emerald-500",
  system_alert: "text-red-500",
  blocker_detected: "text-amber-500",
  blocker_resolved: "text-emerald-500",
};

const typeBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  task_created: { label: "Created", variant: "default" },
  task_updated: { label: "Updated", variant: "secondary" },
  task_completed: { label: "Done", variant: "outline" },
  agent_routed: { label: "Routed", variant: "secondary" },
  agent_paused: { label: "Paused", variant: "secondary" },
  agent_resumed: { label: "Resumed", variant: "outline" },
  system_alert: { label: "Alert", variant: "destructive" },
  blocker_detected: { label: "Blocked", variant: "destructive" },
  blocker_resolved: { label: "Resolved", variant: "outline" },
};

export default function LiveFeedPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getFeedEvents(20);
      setEvents(result.data);
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load events</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Live Feed" description="Real-time event stream">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Events</CardTitle>
          <Badge variant="outline" className="gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </Badge>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Some data may be stale: {error}
            </div>
          )}

          {events.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No events yet</p>
          ) : (
            <div className="space-y-0">
              {events.map((event) => {
                const Icon = iconMap[event.event_type] ?? Plus;
                const color = colorMap[event.event_type] ?? "text-gray-500";
                const badge = typeBadge[event.event_type] ?? { label: event.event_type, variant: "outline" as const };

                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-4 border-b py-3 last:border-0"
                  >
                    <span className="w-14 shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{event.summary}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={badge.variant} className="text-xs">
                          {badge.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{event.source}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
