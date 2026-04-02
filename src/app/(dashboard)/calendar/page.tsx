"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Calendar as CalendarIcon,
  Clock,
  Zap,
  Repeat,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";

interface ScheduledItem {
  id: string;
  title: string;
  type: "routine" | "cron" | "task" | "review";
  schedule: string;
  frequency: string;
  lastRun: string | null;
  nextRun: string;
  status: "active" | "paused" | "completed";
}

const SCHEDULED_ITEMS: ScheduledItem[] = [
  { id: "s1", title: "Daily Autonomy Check", type: "routine", schedule: "Every hour", frequency: "hourly", lastRun: new Date(Date.now() - 3600000).toISOString(), nextRun: new Date(Date.now() + 3600000).toISOString(), status: "active" },
  { id: "s2", title: "Nightly Summary", type: "cron", schedule: "23:00 UTC daily", frequency: "daily", lastRun: new Date(Date.now() - 3600000 * 24).toISOString(), nextRun: new Date(Date.now() + 3600000 * 12).toISOString(), status: "active" },
  { id: "s3", title: "Weekly Review", type: "routine", schedule: "Mondays 09:00 UTC", frequency: "weekly", lastRun: new Date(Date.now() - 86400000 * 2).toISOString(), nextRun: new Date(Date.now() + 86400000 * 5).toISOString(), status: "active" },
  { id: "s4", title: "Monthly Strategy Review", type: "routine", schedule: "1st of month", frequency: "monthly", lastRun: new Date(Date.now() - 86400000 * 15).toISOString(), nextRun: new Date(Date.now() + 86400000 * 15).toISOString(), status: "active" },
  { id: "s5", title: "Quarterly Redesign", type: "routine", schedule: "Quarterly", frequency: "quarterly", lastRun: null, nextRun: new Date(Date.now() + 86400000 * 60).toISOString(), status: "active" },
  { id: "s6", title: "Skill Quota Reset", type: "cron", schedule: "1st of month", frequency: "monthly", lastRun: null, nextRun: new Date(Date.now() + 86400000 * 15).toISOString(), status: "active" },
  { id: "s7", title: "Agent Heartbeat Check", type: "routine", schedule: "Every 30 min", frequency: "30min", lastRun: new Date(Date.now() - 1800000).toISOString(), nextRun: new Date(Date.now() + 1800000).toISOString(), status: "active" },
  { id: "s8", title: "Portfolio Health Check", type: "routine", schedule: "Every 6 hours", frequency: "6h", lastRun: new Date(Date.now() - 3600000 * 3).toISOString(), nextRun: new Date(Date.now() + 3600000 * 3).toISOString(), status: "active" },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

export default function CalendarPage() {
  const [items] = useState<ScheduledItem[]>(SCHEDULED_ITEMS);
  const [filter, setFilter] = useState<string>("all");

  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });

  const activeCount = items.filter((i) => i.status === "active").length;

  return (
    <PageShell title="Calendar" description="Scheduled tasks, cron jobs, and routines">
      {/* Stats */}
      <div className="grid gap-3 grid-cols-3 sm:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Active Routines</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "var(--accent)" }}>{activeCount}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Cron Jobs</p>
          <p className="text-2xl font-bold mt-1">{items.filter((i) => i.type === "cron").length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Routines</p>
          <p className="text-2xl font-bold mt-1">{items.filter((i) => i.type === "routine").length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Total Scheduled</p>
          <p className="text-2xl font-bold mt-1">{items.length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {["all", "routine", "cron"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize"
            style={{
              background: filter === f ? "var(--text)" : "transparent",
              color: filter === f ? "var(--surface)" : "var(--text-muted)",
            }}
          >
            {f === "all" ? "All" : f === "routine" ? "Routines" : "Cron Jobs"}
          </button>
        ))}
      </div>

      {/* Schedule list */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <Card key={item.id} className="surface-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="icon-box-sm" style={{ background: "var(--accent-soft)" }}>
                    {item.type === "cron" ? (
                      <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} />
                    ) : (
                      <Repeat className="h-4 w-4" style={{ color: "var(--accent)" }} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.schedule}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                      {item.lastRun ? `Last: ${timeAgo(item.lastRun)}` : "Not yet run"}
                    </p>
                    <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                      Next: {timeUntil(item.nextRun)}
                    </p>
                  </div>
                  <div className={`h-2 w-2 rounded-full ${item.status === "active" ? "dot-green" : item.status === "paused" ? "dot-amber" : "dot-gray"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
