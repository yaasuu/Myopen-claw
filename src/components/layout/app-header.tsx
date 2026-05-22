"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getUnreadCount } from "@/lib/data/notifications";
import { getSystemStatus } from "@/lib/data/system";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { SystemStatus } from "@/types/dashboard";

const pageTitles: Record<string, string> = {
  "/overview": "Overview",
  "/tasks": "Tasks",
  "/agents": "Agents",
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

export function AppHeader() {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Mission Control";
  const [unread, setUnread] = useState(0);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  const loadCount = useCallback(async () => {
    const result = await getUnreadCount();
    if (!result.error) setUnread(result.count);
  }, []);

  const loadStatus = useCallback(async () => {
    const result = await getSystemStatus();
    if (!result.error) setSystemStatus(result.data);
  }, []);

  useRealtime("notifications", loadCount);
  useRealtime("system_status", loadStatus);

  useEffect(() => {
    loadCount();
    loadStatus();
  }, [loadCount, loadStatus]);

  return (
    <header
      className="flex h-[52px] items-center justify-between border-b px-6"
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
        <Link href="/notifications">
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 w-8 rounded-lg p-0 hover-surface focus-ring"
          >
            <Bell className="h-[18px] w-[18px]" style={{ color: "var(--text-quiet)" }} />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: "var(--accent)", color: "var(--bg)" }}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </Link>

        <div className="divider" />

        <ThemeToggle />

        <div className="divider" />

        {(() => {
          const s = statusConfig[systemStatus?.status ?? "healthy"];
          return (
            <Badge
              variant="outline"
              className="gap-1.5 text-[11px] font-medium"
              style={{ borderColor: s.border, background: s.bg, color: s.color }}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </Badge>
          );
        })()}
      </div>
    </header>
  );
}
