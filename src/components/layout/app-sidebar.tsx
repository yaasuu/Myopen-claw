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
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
  { title: "Agents", href: "/agents", icon: Bot },
  { title: "Org Chart", href: "/org-chart", icon: Network },
  { title: "Live Feed", href: "/live-feed", icon: Radio },
  { title: "Alerts", href: "/alerts", icon: Bell },
  { title: "Notifications", href: "/notifications", icon: Inbox },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="border-b px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg">
            🦀
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight tracking-tight">
              Yas Claw
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
              Mission Control
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
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
                        "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className={cn(
                          "h-4 w-4",
                          isActive ? "text-primary" : "text-muted-foreground/60"
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

      <SidebarFooter className="border-t px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="status-dot bg-emerald-500" />
          <span className="text-xs font-medium text-muted-foreground">
            System operational
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
