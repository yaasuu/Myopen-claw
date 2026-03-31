import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Globe, Key, Bell, Bot, Shield, Activity } from "lucide-react";

const sections = [
  {
    title: "Database",
    icon: Database,
    items: [
      { label: "Provider", value: "Supabase" },
      { label: "Status", value: "Connected", status: "healthy" as const },
      { label: "Tables", value: "agents, tasks, feed_events, org_nodes, system_status" },
    ],
  },
  {
    title: "Integrations",
    icon: Globe,
    items: [
      { label: "Supabase", value: "Active" },
      { label: "Realtime", value: "Enabled", status: "healthy" as const },
      { label: "Orchestrator API", value: "Active" },
    ],
  },
  {
    title: "API Keys",
    icon: Key,
    items: [
      { label: "Supabase URL", value: "Configured ✓" },
      { label: "Supabase Anon Key", value: "Configured ✓" },
      { label: "Auth Mode", value: "Anonymous (read/write)" },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    items: [
      { label: "Realtime updates", value: "On" },
      { label: "Feed events", value: "Active" },
      { label: "Alert routing", value: "Automatic" },
    ],
  },
];

const agentInfo = [
  { name: "Yas Claw", emoji: "🦀", role: "System Operator", skills: 0 },
  { name: "Export-Growth", emoji: "📦", role: "Export Specialist", skills: 1 },
  { name: "Ops-Improvement", emoji: "⚙️", role: "Ops Specialist", skills: 1 },
  { name: "Architecture-Systems", emoji: "🏗️", role: "Architecture Specialist", skills: 1 },
];

const statusColor = {
  healthy: "text-emerald-500",
  warning: "text-[var(--warning)]",
  error: "text-[var(--danger)]",
};

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="System configuration, integrations, and agent overview"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="surface-card">
            <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <section.icon className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {section.title}
              </h3>
            </div>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      {item.label}
                    </span>
                    {item.status ? (
                      <Badge
                        variant="outline"
                        className={statusColor[item.status]}
                      >
                        {item.value}
                      </Badge>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-quiet)" }}>
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </div>
        ))}
      </div>

      {/* Agent Overview */}
      <div className="surface-card">
        <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <Bot className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Agent Overview
          </h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {agentInfo.map((agent) => (
              <div key={agent.name} className="rounded-lg p-3" style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{agent.emoji}</span>
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{agent.name}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{agent.role}</p>
                <div className="flex items-center gap-1 mt-2">
                  <div className="h-1.5 w-1.5 rounded-full dot-green" />
                  <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>Active · {agent.skills} skills</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </div>

      {/* System Info */}
      <div className="surface-card">
        <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <Activity className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            System Info
          </h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Version</p>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>1.0.0</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Framework</p>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Next.js 16</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Environment</p>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Production</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Design System</p>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Mission Control</p>
            </div>
          </div>
        </CardContent>
      </div>
    </PageShell>
  );
}
