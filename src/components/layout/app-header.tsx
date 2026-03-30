"use client";

import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/context";
import { LogOut, Shield, Eye } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/overview": "Overview",
  "/tasks": "Tasks",
  "/agents": "Agents",
  "/org-chart": "Org Chart",
  "/live-feed": "Live Feed",
  "/alerts": "Alerts",
  "/settings": "Settings",
};

export function AppHeader() {
  const pathname = usePathname();
  const { user, role, signOut } = useAuth();
  const title = pageTitles[pathname] ?? "Mission Control";

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-7 w-7" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Healthy
        </Badge>

        {user && (
          <>
            <Badge variant="outline" className="gap-1.5">
              {role === "admin" ? (
                <Shield className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {role}
            </Badge>

            <span className="text-xs text-muted-foreground max-w-[160px] truncate">
              {user.email}
            </span>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7 text-muted-foreground"
              onClick={signOut}
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
