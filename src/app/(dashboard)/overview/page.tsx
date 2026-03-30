import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const summaryCards = [
  {
    title: "Active Agents",
    value: "3",
    icon: Bot,
    description: "All operational",
  },
  {
    title: "Open Tasks",
    value: "12",
    icon: Clock,
    description: "4 in progress",
  },
  {
    title: "Blocked",
    value: "1",
    icon: AlertTriangle,
    description: "Needs attention",
  },
  {
    title: "Completed (7d)",
    value: "24",
    icon: CheckCircle2,
    description: "On track",
  },
];

export default function OverviewPage() {
  return (
    <PageShell
      title="Overview"
      description="Operating summary — last updated just now"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  time: "2m ago",
                  event: "Task 'Review export docs' assigned to Export-Growth",
                },
                {
                  time: "15m ago",
                  event: "Agent Ops-Improvement completed workflow review",
                },
                {
                  time: "1h ago",
                  event: "New task 'Supplier readiness check' created",
                },
                {
                  time: "2h ago",
                  event: "Agent Architecture-Systems paused",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-sm"
                >
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">
                    {item.time}
                  </span>
                  <span>{item.event}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Blocked Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Buyer follow-up: Acme Corp
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Waiting on supplier quote — 3 days overdue
                  </p>
                </div>
                <Badge variant="destructive">High</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                1 item needs attention
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
