"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
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
  AlertTriangle,
  CheckCircle2,
  Bot,
  ShieldAlert,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  CheckCheck,
  Bell,
} from "lucide-react";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "@/lib/data/notifications";
import { useRealtime } from "@/lib/realtime/use-realtime";

const iconMap: Record<string, typeof AlertTriangle> = {
  task_created: CheckCircle2,
  blocker_detected: AlertTriangle,
  blocker_resolved: CheckCircle2,
  agent_paused: Bot,
  agent_resumed: Bot,
  system_alert: ShieldAlert,
  task_reassigned: ArrowRightLeft,
  task_completed: CheckCircle2,
};

const severityStyles: Record<string, { border: string; bg: string; badge: string }> = {
  critical: { border: "border-l-red-500", bg: "bg-[rgba(239,68,68,0.08)]/50", badge: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" },
  warning: { border: "border-l-amber-500", bg: "bg-[rgba(245,158,11,0.08)]/50", badge: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" },
  info: { border: "border-l-blue-400", bg: "", badge: "bg-[rgba(59,130,246,0.12)] text-[var(--info)]" },
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

const SEVERITIES = ["all", "critical", "warning", "info"] as const;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterRead, setFilterRead] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getNotifications({
        unreadOnly: filterRead === "unread",
        limit: 50,
      });
      setNotifications(result.data);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [filterRead]);
  useRealtime("notifications", loadRef);

  useEffect(() => {
    load();
  }, [filterRead]);

  async function handleMarkRead(id: string) {
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  const filtered = notifications.filter((n) => {
    if (filterSeverity !== "all" && n.severity !== filterSeverity) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <PageShell title="Notifications" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notifications...
        </div>
      </PageShell>
    );
  }

  if (error && notifications.length === 0) {
    return (
      <PageShell title="Notifications" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load notifications</p>
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

  return (
    <PageShell>
      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          Some data may be stale: {error}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>Notifications</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Operator inbox · system alerts
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
               style={{ borderColor: "rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)" }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--danger)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--danger)" }} />
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
              {unreadCount} unread
            </span>
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterRead} onValueChange={setFilterRead}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All severities" : s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleMarkAllRead}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}

        <Badge variant="outline" className="gap-1.5">
          <Bell className="h-3 w-3" />
          {unreadCount} unread
        </Badge>
      </div>

      {/* Notification list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {notifications.length === 0
                ? "No notifications yet"
                : "No notifications match the current filters"}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((notif) => {
                const Icon = iconMap[notif.type] ?? AlertTriangle;
                const styles = severityStyles[notif.severity] ?? severityStyles.info;

                // Build link target
                let href: string | null = null;
                if (notif.related_agent_id) href = `/agents/${notif.related_agent_id}`;
                else if (notif.related_task_id) href = "/tasks";

                const content = (
                  <div
                    className={`flex items-start gap-4 px-5 py-4 border-l-4 ${styles.border} ${
                      notif.is_read ? "opacity-60" : styles.bg
                    } hover:bg-muted/30 transition-colors cursor-pointer`}
                    onClick={() => {
                      if (!notif.is_read) handleMarkRead(notif.id);
                    }}
                  >
                    {/* Icon */}
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      notif.severity === "critical" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                      notif.severity === "warning" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                      "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${notif.is_read ? "" : "font-semibold"}`}>
                          {notif.title}
                        </span>
                        <Badge className={`text-xs ${styles.badge}`}>
                          {notif.severity}
                        </Badge>
                        {!notif.is_read && (
                          <span className="h-2 w-2 rounded-full dot-blue shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{notif.message}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{timeAgo(notif.created_at)}</span>
                        <span>·</span>
                        <span>{new Date(notif.created_at).toLocaleString()}</span>
                        <span>·</span>
                        <span className="capitalize">{notif.type.replace(/_/g, " ")}</span>
                      </div>
                    </div>

                    {/* Action */}
                    {href && (
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </div>
                );

                if (href) {
                  return (
                    <Link key={notif.id} href={href}>
                      {content}
                    </Link>
                  );
                }

                return <div key={notif.id}>{content}</div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
