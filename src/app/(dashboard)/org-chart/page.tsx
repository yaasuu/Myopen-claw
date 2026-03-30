"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { getOrgNodes } from "@/lib/data/org";
import type { OrgNode } from "@/types/dashboard";

const statusColor: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50",
  paused: "border-amber-200 bg-amber-50",
  retired: "border-gray-200 bg-gray-50",
};

function NodeCard({ node }: { node: OrgNode }) {
  return (
    <Card className={`w-56 ${statusColor[node.status]}`}>
      <CardHeader className="pb-2 text-center">
        <div className="text-2xl">{node.emoji}</div>
        <CardTitle className="text-sm font-medium">{node.name}</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-xs text-muted-foreground">{node.role}</p>
        <Badge variant="outline" className="mt-2 text-xs">
          {node.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

export default function OrgChartPage() {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getOrgNodes();
      setNodes(result.data);
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load org chart");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <PageShell title="Org Chart" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading org chart...
        </div>
      </PageShell>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <PageShell title="Org Chart" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load org chart</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const root = nodes.find((n) => n.parent_id === null);
  const children = root
    ? nodes.filter((n) => n.parent_id === root.id).sort((a, b) => a.sort_order - b.sort_order)
    : [];

  return (
    <PageShell
      title="Org Chart"
      description="Agent hierarchy and routing structure"
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Some data may be stale: {error}
        </div>
      )}

      {!root ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No org nodes configured
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="flex justify-center">
              <div className="border-2 border-primary/20 rounded-xl">
                <NodeCard node={root} />
              </div>
            </div>

            {children.length > 0 && (
              <>
                <div className="flex justify-center">
                  <div className="h-8 w-px bg-border" />
                </div>
                <div className="relative mx-auto flex justify-center">
                  <div className="absolute top-0 left-1/3 right-1/3 h-px bg-border" />
                  <div className="flex gap-16">
                    {children.map((child) => (
                      <div key={child.id} className="flex flex-col items-center">
                        <div className="h-8 w-px bg-border" />
                        <NodeCard node={child} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
