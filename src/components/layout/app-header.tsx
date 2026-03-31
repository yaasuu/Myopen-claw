"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getUnreadCount } from "@/lib/data/notifications";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { Bell } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/overview": "Overview",
  "/tasks": "Tasks",
  "/agents": "Agents",
  "/org-chart": "Org Chart",
  "/live-feed": "Live Feed",
  "/alerts": "Alerts",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/hiring": "Hiring",
  "/autonomy": "Autonomy",
  "/skills": "Skills",
  "/notes": "Notes",
  "/departments": "Departments",
  "/specialists": "Specialists",
  "/projects": "Projects",
  "/portfolio": "Portfolio",
};

export function AppHeader() {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Mission Control";
  const [unread, setUnread] = useState(0);

  const loadCount = useCallback(async () => {
    const result = await getUnreadCount();
    if (!result.error) setUnread(result.count);
  }, []);

  useRealtime("notifications", loadCount);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  return (
    <header className="flex h-[52px] items-center justify-between border-b border-white/[0.06] bg-[#0E1116]/80 backdrop-blur-xl px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-7 w-7 rounded-lg hover:bg-white/[0.06] transition-colors text-muted-foreground" />
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <Link href="/notifications">
          <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-lg p-0 hover:bg-white/[0.06]">
            <Bell className="h-[18px] w-[18px] text-[#7F8A9A]" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-[#0E1116] ring-2 ring-[#0E1116]">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </Link>

        <div className="divider-executive" />

        <Badge
          variant="outline"
          className="gap-1.5 border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 text-[11px] font-medium"
        >
          <span className="status-dot status-dot-green" />
          Healthy
        </Badge>
      </div>
    </header>
  );
}
