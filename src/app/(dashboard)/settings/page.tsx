import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Globe, Key, Bell } from "lucide-react";

const sections = [
  {
    title: "Database",
    icon: Database,
    items: [
      { label: "Provider", value: "Not configured" },
      { label: "Status", value: "Disconnected", status: "warning" as const },
    ],
  },
  {
    title: "Integrations",
    icon: Globe,
    items: [
      { label: "Supabase", value: "Not configured" },
      { label: "Paperclip", value: "Not connected" },
    ],
  },
  {
    title: "API Keys",
    icon: Key,
    items: [
      { label: "Supabase URL", value: "Not set" },
      { label: "Supabase Anon Key", value: "Not set" },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    items: [
      { label: "Email alerts", value: "Off" },
      { label: "Telegram alerts", value: "Off" },
    ],
  },
];

const statusColor = {
  healthy: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="System configuration and integrations"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="flex flex-row items-center gap-2">
              <section.icon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
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
                      <span className="text-xs text-muted-foreground">
                        {item.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">System Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Version</p>
              <p className="text-sm font-medium">0.1.0</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Environment</p>
              <p className="text-sm font-medium">Development</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last deploy</p>
              <p className="text-sm font-medium">—</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
