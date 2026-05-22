"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getUnreadCount, getNotifications, markAsRead, markAllAsRead, type Notification } from "@/lib/data/notifications";
import { getSystemStatus } from "@/lib/data/system";
import { getApprovals } from "@/lib/data/learning";
import { getCapabilityGaps } from "@/lib/data/capability-governance";
import { getSupabase } from "@/lib/supabase/client";
import { useRealtime, useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { Bell, CheckSquare, AlertTriangle, CheckCheck, ArrowRight, X, Inbox } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { timeAgo } from "@/lib/utils";
import type { SystemStatus } from "@/types/dashboard";

const pageTitles: Record<string, string> = {
  "/overview": "Overview",
  "/tasks": "Tasks",
  "/org-chart": "Org Chart",
  "/live-feed": "Live Feed",
  "/alerts": "Alerts",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/hermes": "Hermes",
  "/approvals": "Approvals",
  "/goals": "Goals",
  "/departments": "Departments",
  "/skills": "Skills",
  "/memory": "Memory",
  "/knowledge": "Knowledge",
  "/hiring": "Hiring",
  "/autonomy": "Autonomy",
  "/learning": "Learning Hub",
  "/specialists": "Specialists",
  "/projects": "Projects",
  "/outputs": "Outputs",
};

const statusConfig: Record<string, { label: string; dot: string; border: string; bg: string; color: string }> = {
  healthy:  { label: "Healthy",  dot: "dot-green", border: "rgba(16,185,129,0.2)",  bg: "rgba(16,185,129,0.08)",  color: "var(--success)" },
  degraded: { label: "Degraded", dot: "dot-amber", border: "rgba(245,158,11,0.2)",  bg: "rgba(245,158,11,0.08)",  color: "var(--warning)" },
  down:     { label: "Down",     dot: "dot-red",   border: "rgba(239,68,68,0.2)",   bg: "rgba(239,68,68,0.08)",   color: "var(--danger)"  },
};

const severityStyle: Record<Notification["severity"], { bg: string; color: string; dot: string }> = {
  info:     { bg: "rgba(37,99,235,0.08)",  color: "var(--info)",    dot: "dot-blue" },
  warning:  { bg: "rgba(245,158,11,0.08)", color: "var(--warning)", dot: "dot-amber" },
  critical: { bg: "rgba(220,38,38,0.08)",  color: "var(--danger)",  dot: "dot-red" },
};

export function AppHeader() {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Mission Control";
  const [unread, setUnread] = useState(0);
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Notifications modal
  const [notifOpen, setNotifOpen]   = useState(false);
  const [notifs, setNotifs]         = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const loadCount = useCallback(async () => {
    const result = await getUnreadCount();
    if (!result.error) setUnread(result.count);
  }, []);

  const loadStatus = useCallback(async () => {
    const result = await getSystemStatus();
    if (!result.error) setSystemStatus(result.data);
  }, []);

  // Count items that need Yas: pending typed approvals + pending skill requests + pending capability gaps
  const loadApprovals = useCallback(async () => {
    try {
      const [typed, gaps] = await Promise.all([
        getApprovals("pending"),
        getCapabilityGaps({ status: "pending" }),
      ]);
      // Pending skill requests via direct query (column-defensive)
      let skillPending = 0;
      const supabase = getSupabase();
      if (supabase) {
        const { count } = await supabase
          .from("skill_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending");
        skillPending = count ?? 0;
      }
      setApprovalsCount(typed.length + (gaps.data?.length ?? 0) + skillPending);
    } catch {
      // silent — header should never break the page
    }
  }, []);

  useRealtime("notifications", loadCount);
  useRealtime("system_status", loadStatus);
  useRealtimeMulti(["skill_requests"], loadApprovals);

  useEffect(() => {
    loadCount();
    loadStatus();
    loadApprovals();
  }, [loadCount, loadStatus, loadApprovals]);

  // Refresh approvals count when navigating between pages
  useEffect(() => { loadApprovals(); }, [pathname, loadApprovals]);

  // Close popover on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen]);

  async function openNotifs() {
    setNotifOpen(true);
    setLoadingNotifs(true);
    const res = await getNotifications();
    setNotifs(res.data);
    setLoadingNotifs(false);
  }

  async function handleMarkRead(id: string) {
    await markAsRead(id);
    setNotifs((p) => p.map((n) => n.id === id ? { ...n, is_read: true } : n));
    loadCount();
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifs((p) => p.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  }

  const s = statusConfig[systemStatus?.status ?? "healthy"];

  return (
    <header
      className="relative flex h-[52px] items-center justify-between border-b px-6"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg)",
      }}
    >
      <div className="flex items-center gap-3">
        <SidebarTrigger
          className="h-7 w-7 rounded-lg hover-surface focus-ring"
          style={{ color: "var(--text-muted)" }}
        />
        <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Approvals badge */}
        <Link href="/approvals">
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 w-8 rounded-lg p-0 hover-surface focus-ring"
            title={approvalsCount > 0 ? `${approvalsCount} pending approval${approvalsCount !== 1 ? "s" : ""}` : "No pending approvals"}
          >
            <CheckSquare className="h-[18px] w-[18px]" style={{ color: approvalsCount > 0 ? "var(--accent)" : "var(--text-quiet)" }} />
            {approvalsCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold animate-pulse"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {approvalsCount > 99 ? "99+" : approvalsCount}
              </span>
            )}
          </Button>
        </Link>

        {/* Notifications popover trigger */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 w-8 rounded-lg p-0 hover-surface focus-ring"
            onClick={() => notifOpen ? setNotifOpen(false) : openNotifs()}
            title={unread > 0 ? `${unread} unread notification${unread !== 1 ? "s" : ""}` : "Notifications"}
          >
            <Bell className="h-[18px] w-[18px]" style={{ color: unread > 0 ? "var(--danger)" : "var(--text-quiet)" }} />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: "var(--danger)", color: "#fff" }}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>

          {/* Popover */}
          {notifOpen && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] rounded-xl border z-50 flex flex-col overflow-hidden"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                boxShadow: "0 8px 32px rgba(15,23,42,0.15)",
              }}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" style={{ color: "var(--accent)" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Notifications</span>
                  {unread > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(220,38,38,0.12)", color: "var(--danger)" }}>
                      {unread} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-medium rounded px-1.5 py-0.5 hover:bg-[var(--surface-muted)] flex items-center gap-1"
                      style={{ color: "var(--text-muted)" }}
                      title="Mark all read"
                    >
                      <CheckCheck className="h-3 w-3" /> Mark all
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} className="rounded p-1 hover:bg-[var(--surface-muted)]">
                    <X className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1">
                {loadingNotifs ? (
                  <div className="py-10 text-center text-xs" style={{ color: "var(--text-quiet)" }}>Loading…</div>
                ) : notifs.length === 0 ? (
                  <div className="py-10 text-center">
                    <Inbox className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>All caught up</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-quiet)" }}>No notifications yet.</p>
                  </div>
                ) : (
                  <div>
                    {notifs.slice(0, 12).map((n) => {
                      const sev = severityStyle[n.severity] ?? severityStyle.info;
                      return (
                        <div
                          key={n.id}
                          className="flex items-start gap-3 px-4 py-3 border-b cursor-pointer hover:bg-[var(--surface-muted)] transition-colors"
                          style={{ borderColor: "var(--border)", opacity: n.is_read ? 0.6 : 1 }}
                          onClick={() => !n.is_read && handleMarkRead(n.id)}
                        >
                          <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${sev.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{n.title}</p>
                              {!n.is_read && (
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                              )}
                            </div>
                            <p className="text-[11px] leading-snug mt-0.5" style={{ color: "var(--text-muted)" }}>{n.message}</p>
                            <p className="text-[10px] mt-1" style={{ color: "var(--text-quiet)" }}>{timeAgo(n.created_at)}</p>
                          </div>
                          {n.severity === "critical" && (
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-1" style={{ color: sev.color }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                <Link href="/notifications" onClick={() => setNotifOpen(false)} className="text-xs font-medium flex items-center justify-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                  View all notifications <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="divider" />

        <ThemeToggle />

        <div className="divider" />

        <Badge
          variant="outline"
          className="gap-1.5 text-[11px] font-medium"
          style={{ borderColor: s.border, background: s.bg, color: s.color }}
        >
          <div className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </Badge>
      </div>
    </header>
  );
}
