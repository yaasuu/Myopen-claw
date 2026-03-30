"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Clock,
  Users,
  Target,
  Bot,
} from "lucide-react";
import { getDepartments, getDepartmentPerformance } from "@/lib/data/departments";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Department, Agent, TaskWithAgent } from "@/types/dashboard";

export default function DepartmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [performance, setPerformance] = useState<ReturnType<typeof getDepartmentPerformance>>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [deptResult, agentsResult, tasksResult] = await Promise.all([
        getDepartments(),
        getAgents(),
        getTasks(),
      ]);
      if (deptResult.error) setError(deptResult.error);
      setDepartments(deptResult.data);
      setPerformance(getDepartmentPerformance(tasksResult.data, agentsResult.data, deptResult.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks"], loadRef);

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <PageShell title="Departments" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading departments...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Departments" description="Persistent organizational departments">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => {
          const perf = performance.find((p) => p.department.id === dept.id);
          const isActive = dept.status === "active";

          return (
            <Link key={dept.id} href={`/departments/${dept.id}`}>
              <Card className="stat-card hover:shadow-md transition-all cursor-pointer h-full group">
                <CardContent className="p-6 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-xl">
                        {dept.emoji}
                      </div>
                      <div>
                        <p className="text-sm font-bold tracking-tight">{dept.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={`status-dot ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {dept.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Badge className={`text-[10px] ${
                      dept.priority === "high" ? "bg-red-100 text-red-700" :
                      dept.priority === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {dept.priority}
                    </Badge>
                  </div>

                  {/* Mandate */}
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {dept.mandate}
                  </p>

                  {/* Stats */}
                  {perf && (
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                      <div className="text-center">
                        <div className="text-lg font-bold">{perf.totalTasks}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasks</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-lg font-bold ${perf.blockedTasks > 0 ? "text-red-600" : ""}`}>
                          {perf.blockedTasks}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Blocked</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-emerald-600">{perf.completedTasks}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Done</div>
                      </div>
                    </div>
                  )}

                  {/* Agents */}
                  {perf && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                      <Bot className="h-3 w-3" />
                      <span>{perf.assignedAgents.length} agent{perf.assignedAgents.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{perf.agentUtilization}% utilization</span>
                    </div>
                  )}

                  {/* Arrow */}
                  <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                    View department <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
