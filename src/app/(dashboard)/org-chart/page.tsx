import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const orgTree = {
  id: "yas-claw",
  name: "Yas Claw",
  role: "System Operator / AI Chief of Staff",
  emoji: "🦀",
  status: "active" as const,
  children: [
    {
      id: "export-growth",
      name: "Export-Growth Agent",
      role: "Export execution, leads, buyer follow-up",
      emoji: "📦",
      status: "active" as const,
      children: [],
    },
    {
      id: "ops-improvement",
      name: "Ops-Improvement Agent",
      role: "Workflows, routines, process improvement",
      emoji: "⚙️",
      status: "active" as const,
      children: [],
    },
    {
      id: "architecture-systems",
      name: "Architecture-Systems Agent",
      role: "Platform design, data modeling, system architecture",
      emoji: "🏗️",
      status: "paused" as const,
      children: [],
    },
  ],
};

const statusColor = {
  active: "border-emerald-200 bg-emerald-50",
  paused: "border-amber-200 bg-amber-50",
  retired: "border-gray-200 bg-gray-50",
};

function OrgNodeCard({
  node,
  isRoot = false,
}: {
  node: typeof orgTree;
  isRoot?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <Card
        className={`w-64 ${isRoot ? "border-2 border-primary/20" : ""} ${statusColor[node.status]}`}
      >
        <CardHeader className="pb-2 text-center">
          <div className="text-2xl">{node.emoji}</div>
          <CardTitle className="text-sm font-medium">{node.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-xs text-muted-foreground">{node.role}</p>
          <Badge
            variant="outline"
            className="mt-2 text-xs"
          >
            {node.status}
          </Badge>
        </CardContent>
      </Card>

      {node.children.length > 0 && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="flex gap-6">
            {node.children.map((child) => (
              <div
                key={child.id}
                className="flex flex-col items-center"
              >
                <div className="h-6 w-px bg-border" />
                <OrgNodeCard node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  return (
    <PageShell
      title="Org Chart"
      description="Agent hierarchy and routing structure"
    >
      <Card>
        <CardContent className="flex items-start justify-center py-12">
          <OrgNodeCard
            node={orgTree}
            isRoot
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
