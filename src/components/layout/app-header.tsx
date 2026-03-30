"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/context";
import { getUnreadCount } from "@/lib/data/notifications";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { LogOut, Shield, Eye, Bell } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/overview": "Overview",
  "/tasks": "Tasks",
  "/agents": "Agents",
  "/org-chart": "Org Chart",
  "/live-feed": "Live Feed",
  "/alerts": "Alerts",
  "/notifications": "Notifications",
  "/settings": "Settings",
};

export function AppHeader() {
  const pathname = usePathname();
  const { user, role, signOut } = useAuth();
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
    <header className="flex h-[52px] items-center justify-between border-b bg-card/50 backdrop-blur-sm px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-7 w-7 rounded-md hover:bg-muted transition-colors" />
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <Link href="/notifications">
          <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-lg p-0">
            <Bell className="h-[18px] w-[18px] text-muted-foreground" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-card">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Button>
        </Link>

        <div className="mx-1 h-5 w-px bg-border" />

        <Badge
          variant="outline"
          className="gap-1.5 border-emerald-200/60 bg-emerald-50/80 text-emerald-700 text-xs font-medium"
        >
          <span className="status-dot bg-emerald-500" />
          Healthy
        </Badge>

        {user && (
          <>
            <Badge variant="outline" className="gap-1.5 text-xs font-medium">
              {role === "admin" ? (
                <Shield className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {role}
            </Badge>

            <div className="mx-1 h-5 w-px bg-border" />

            <span className="text-xs text-muted-foreground max-w-[140px] truncate font-medium">
              {user.email}
            </span>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
