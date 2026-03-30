import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, AlertTriangle, Plus, ArrowRight } from "lucide-react";

const events = [
  {
    time: "07:31",
    type: "task_created",
    source: "system",
    summary: "New task 'Review export docs' created",
    icon: Plus,
    color: "text-blue-500",
  },
  {
    time: "07:28",
    type: "agent_routed",
    source: "Yas Claw",
    summary: "Task assigned to Export-Growth Agent",
    icon: ArrowRight,
    color: "text-violet-500",
  },
  {
    time: "07:15",
    type: "task_completed",
    source: "Ops-Improvement",
    summary: "Completed: Weekly workflow review",
    icon: CheckCircle2,
    color: "text-emerald-500",
  },
  {
    time: "06:50",
    type: "blocker_detected",
    source: "system",
    summary: "Blocker detected on 'Supplier quote' — overdue 3 days",
    icon: AlertTriangle,
    color: "text-amber-500",
  },
  {
    time: "06:30",
    type: "agent_paused",
    source: "Yas Claw",
    summary: "Architecture-Systems Agent paused",
    icon: Bot,
    color: "text-gray-500",
  },
];

const typeBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  task_created: { label: "Created", variant: "default" },
  agent_routed: { label: "Routed", variant: "secondary" },
  task_completed: { label: "Done", variant: "outline" },
  blocker_detected: { label: "Blocked", variant: "destructive" },
  agent_paused: { label: "Paused", variant: "secondary" },
};

export default function LiveFeedPage() {
  return (
    <PageShell
      title="Live Feed"
      description="Real-time event stream"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Events</CardTitle>
          <Badge
            variant="outline"
            className="gap-1.5"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {events.map((event, i) => (
              <div
                key={i}
                className="flex items-start gap-4 border-b py-3 last:border-0"
              >
                <span className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground">
                  {event.time}
                </span>
                <event.icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${event.color}`}
                />
                <div className="flex-1 space-y-1">
                  <p className="text-sm">{event.summary}</p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={typeBadge[event.type]?.variant ?? "outline"}
                      className="text-xs"
                    >
                      {typeBadge[event.type]?.label ?? event.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {event.source}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
