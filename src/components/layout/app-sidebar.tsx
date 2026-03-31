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
  Inbox,
  UserPlus,
  Shield,
  Building2,
  Zap,
  GraduationCap,
  BookOpen,
  FolderKanban,
  BarChart3,
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

const navItems = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "Portfolio", href: "/portfolio", icon: BarChart3 },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Agents", href: "/agents", icon: Bot },
  { title: "Departments", href: "/departments", icon: Building2 },
  { title: "Specialists", href: "/specialists", icon: Zap },
  { title: "Org Chart", href: "/org-chart", icon: Network },
  { title: "Live Feed", href: "/live-feed", icon: Radio },
  { title: "Alerts", href: "/alerts", icon: Bell },
  { title: "Notifications", href: "/notifications", icon: Inbox },
  { title: "Hiring", href: "/hiring", icon: UserPlus },
  { title: "Autonomy", href: "/autonomy", icon: Shield },
  { title: "Skills", href: "/skills", icon: GraduationCap },
  { title: "Notes", href: "/notes", icon: BookOpen },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r border-white/[0.06] bg-[#0E1116]">
      <SidebarHeader className="border-b border-white/[0.06] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-lg">
            🦀
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Yas Claw
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Mission Control
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest ds-label">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        "h-8 rounded-lg px-3 text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-primary/[0.08] text-primary"
                          : "text-[#A7B0BE] hover:bg-white/[0.04] hover:text-foreground"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className={cn(
                          "h-[16px] w-[16px]",
                          isActive ? "text-primary" : "text-[#7F8A9A]"
                        )} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="status-dot status-dot-green" />
          <span className="text-xs font-medium text-muted-foreground">
            System operational
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
