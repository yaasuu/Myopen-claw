"use client";

import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";

const pageTitles: Record<string, string> = {
  "/overview": "Overview",
  "/agents": "Agents",
  "/org-chart": "Org Chart",
  "/live-feed": "Live Feed",
  "/settings": "Settings",
};

export function AppHeader() {
  const pathname = usePathname();
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
      </div>
    </header>
  );
}
