"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSystemStatus } from "@/lib/data/system";
import { useRealtime } from "@/lib/realtime/use-realtime";
import type { SystemStatus } from "@/types/dashboard";
import {
  LayoutDashboard,
  Network,
  Radio,
  Settings,
  CheckSquare,
  ClipboardCheck,
  Bell,
  UserPlus,
  Users,
  Shield,
  Zap,
  GraduationCap,
  BookOpen,
  FolderKanban,
  BarChart3,
  Brain,
  ShieldCheck,
  CalendarIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

const sections = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard",  href: "/overview",   icon: LayoutDashboard },
      { title: "Live Feed",  href: "/live-feed",  icon: Radio },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Tasks",    href: "/tasks",    icon: CheckSquare },
      { title: "Projects", href: "/projects", icon: BarChart3 },
      { title: "Outputs",  href: "/outputs",  icon: FolderKanban },
    ],
  },
  {
    label: "Workforce",
    items: [
      { title: "Workforce", href: "/workforce", icon: Users },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Approvals", href: "/approvals", icon: ClipboardCheck },
      { title: "Autonomy",  href: "/autonomy",  icon: Shield },
      { title: "Reviews",   href: "/reviews",   icon: ShieldCheck },
      { title: "Calendar",  href: "/calendar",  icon: CalendarIcon },
      { title: "Hiring",    href: "/hiring",    icon: UserPlus },
      { title: "Learning",  href: "/learning",  icon: BookOpen },
      { title: "Knowledge", href: "/knowledge", icon: Brain },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Alerts",    href: "/alerts",    icon: Bell },
      { title: "Hermes",    href: "/hermes",    icon: Zap },
      { title: "Skills",    href: "/skills",    icon: GraduationCap },
      { title: "Org Chart", href: "/org-chart", icon: Network },
      { title: "Settings",  href: "/settings",  icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  const loadStatus = useCallback(async () => {
    const result = await getSystemStatus();
    if (!result.error) setSystemStatus(result.data);
  }, []);

  useRealtime("system_status", loadStatus);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  return (
    <Sidebar className="border-r" style={{ borderColor: "var(--border)", background: "var(--sidebar-bg)" }}>

      {/* ── Logo ── */}
      <SidebarHeader className="border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
            <span className="text-base">🦀</span>
          </div>
          <div>
            <p className="text-sm font-semibold leading-none" style={{ color: "var(--text)" }}>Yas Claw</p>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest font-medium" style={{ color: "var(--text-quiet)" }}>Mission Control</p>
          </div>
        </div>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent className="px-2 py-3 flex flex-col gap-0 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label} className="mb-3">

            {/* Section label */}
            <p className="px-2 mb-1 text-[9px] font-bold uppercase tracking-widest select-none" style={{ color: "var(--text-quiet)" }}>
              {section.label}
            </p>

            {/* Items */}
            <div className="flex flex-col gap-px">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-[13px] font-medium transition-colors duration-100"
                    style={{
                      background: isActive ? "var(--sidebar-active)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                    }}
                  >
                    <item.icon
                      className="h-[15px] w-[15px] shrink-0"
                      style={{ color: isActive ? "var(--accent)" : "var(--text-quiet)" }}
                    />
                    <span className="truncate">{item.title}</span>
                  </Link>
                );
              })}
            </div>

          </div>
        ))}
      </SidebarContent>

      {/* ── Footer ── */}
      <SidebarFooter className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${
            systemStatus?.status === "down"     ? "dot-red"   :
            systemStatus?.status === "degraded" ? "dot-amber" :
            "dot-green"
          }`} />
          <span className="text-[11px] font-medium" style={{ color: "var(--text-quiet)" }}>
            {systemStatus?.status === "down"     ? "System down"     :
             systemStatus?.status === "degraded" ? "System degraded" :
             "System operational"}
          </span>
        </div>
      </SidebarFooter>

    </Sidebar>
  );
}
