import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Activity, Clock } from "lucide-react";

const agents = [
  {
    name: "Export-Growth Agent",
    emoji: "📦",
    domain: "Export execution, lead generation, buyer follow-up",
    status: "active" as const,
    taskCount: 5,
    lastActivity: "12m ago",
  },
  {
    name: "Ops-Improvement Agent",
    emoji: "⚙️",
    domain: "Workflows, process improvement, routines",
    status: "active" as const,
    taskCount: 4,
    lastActivity: "45m ago",
  },
  {
    name: "Architecture-Systems Agent",
    emoji: "🏗️",
    domain: "Platform design, data modeling, system architecture",
    status: "paused" as const,
    taskCount: 3,
    lastActivity: "2h ago",
  },
];

const statusColor = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  retired: "bg-gray-400",
};

export default function AgentsPage() {
  return (
    <PageShell
      title="Agents"
      description="Specialist agents in the Yas Claw system"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.name}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-lg">{agent.emoji}</span>
                  {agent.name}
                </CardTitle>
                <Badge
                  variant="outline"
                  className="gap-1.5"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${statusColor[agent.status]}`}
                  />
                  {agent.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {agent.domain}
              </p>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{agent.lastActivity}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  <span>{agent.taskCount} tasks</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
