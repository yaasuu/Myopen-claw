"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Network,
  Radio,
  Settings,
  CheckSquare,
  Bell,
  UserPlus,
  Users,
  Shield,
  Building2,
  Zap,
  Lightbulb,
  GraduationCap,
  BookOpen,
  FolderKanban,
  BarChart3,
  Monitor,
  Brain,
  ShieldCheck,
  CalendarIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const sections = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/overview", icon: LayoutDashboard },
      { title: "Live Feed", href: "/live-feed", icon: Radio },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Tasks", href: "/tasks", icon: CheckSquare },
      { title: "Projects", href: "/projects", icon: BarChart3 },
    ],
  },
  {
    label: "Workforce",
    items: [
      { title: "Workforce", href: "/workforce", icon: Users },
      { title: "Office", href: "/office", icon: Monitor },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Autonomy", href: "/autonomy", icon: Shield },
      { title: "Reviews", href: "/reviews", icon: ShieldCheck },
      { title: "Calendar", href: "/calendar", icon: CalendarIcon },
      { title: "Hiring", href: "/hiring", icon: UserPlus },
      { title: "Learning", href: "/learning", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Notes", href: "/notes", icon: BookOpen },
      { title: "Alerts", href: "/alerts", icon: Bell },
      { title: "Team", href: "/org-chart", icon: Network },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r" style={{ borderColor: "var(--border)", background: "var(--sidebar-bg)" }}>
      <SidebarHeader className="border-b px-5 py-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
            <span className="text-lg">🦀</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Yas Claw
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>
              Mission Control
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        {sections.map((section) => (
          <SidebarGroup key={section.label} className="mb-4">
            <SidebarGroupLabel className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className="h-8 rounded-lg px-3 text-[13px] font-medium transition-colors duration-150"
                        style={{
                          background: isActive ? "var(--sidebar-active)" : "transparent",
                          color: isActive ? "var(--accent)" : "var(--text-muted)",
                        }}
                      >
                        <Link href={item.href}>
                          <item.icon
                            className="h-4 w-4"
                            style={{ color: isActive ? "var(--accent)" : "var(--text-quiet)" }}
                          />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full dot-green" />
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            System operational
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
