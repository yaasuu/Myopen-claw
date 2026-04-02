"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { getAgents } from "@/lib/data/agents";
import { getDepartments } from "@/lib/data/departments";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, Department } from "@/types/dashboard";

export default function OrgChartPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["export-growth", "ops-improvement", "architecture-systems"]));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agentsR, deptsR] = await Promise.all([getAgents(), getDepartments()]);
      setAgents(agentsR.data);
      setDepartments(deptsR.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "departments"], loadRef);

  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Map agents to departments
  const deptAgents = new Map<string, Agent[]>();
  for (const dept of departments) {
    const keyword = dept.name.toLowerCase().split("-")[0];
    deptAgents.set(
      dept.id,
      agents.filter((a) => {
        if (a.short_id === "research-agent") return false; // Research Agent goes under Yas Claw
        return a.domain.toLowerCase().includes(keyword) ||
          a.name.toLowerCase().includes(keyword) ||
          (a.short_id === "ui-ux-designer" && dept.short_id === "architecture-systems") ||
          (a.short_id === "data-analyst" && dept.short_id === "ops-improvement");
      })
    );
  }

  // Research Agent goes directly under Yas Claw
  const researchAgent = agents.find((a) => a.short_id === "research-agent");

  // Unassigned agents (excluding research agent)
  const assignedIds = new Set([...deptAgents.values()].flat().map((a) => a.id));
  assignedIds.add(researchAgent?.id ?? ""); // Research agent is assigned to Yas Claw
  const unassigned = agents.filter((a) => !assignedIds.has(a.id));

  if (loading) {
    return (
      <PageShell title="Org Chart" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading org chart...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Team Structure" description="Organization hierarchy — CEO, orchestrator, departments, agents, and specialists">
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>
          {error}
        </div>
      )}

      {/* CEO */}
      <div className="flex justify-center">
        <div className="surface-card-hover p-5 text-center" style={{ minWidth: "220px" }}>
          <div className="text-3xl mb-2">👤</div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Yas</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Chief Executive Officer</p>
          <Badge className="mt-2" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Owner</Badge>
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div className="w-px h-6" style={{ background: "var(--border)" }} />
      </div>

      {/* Yas Claw — Central Orchestrator */}
      <div className="flex justify-center">
        <Link href="/workforce" className="block">
          <div className="surface-card-hover p-5 text-center" style={{ minWidth: "220px" }}>
            <div className="text-3xl mb-2">🦀</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Yas Claw</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Central AI Orchestrator</p>
            <Badge className="mt-2" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>Active</Badge>
          </div>
        </Link>
      </div>

      {/* Research Agent under Yas Claw */}
      {researchAgent && (
        <>
          <div className="flex justify-center">
            <div className="w-px h-6" style={{ background: "var(--border)" }} />
          </div>
          <div className="flex justify-center">
            <Link href={`/agents/${researchAgent.id}`}>
              <div className="surface-card-hover p-4 flex items-center gap-3" style={{ minWidth: "220px" }}>
                <div className="relative">
                  <span className="text-2xl">{researchAgent.emoji}</span>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border ${researchAgent.status === "active" ? "dot-green" : "dot-amber"}`} style={{ borderColor: "var(--surface)" }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{researchAgent.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{researchAgent.domain}</p>
                </div>
              </div>
            </Link>
          </div>
        </>
      )}

      {/* Connector to departments */}
      <div className="flex justify-center">
        <div className="w-px h-6" style={{ background: "var(--border)" }} />
      </div>

      {/* Horizontal connector */}
      <div className="flex justify-center">
        <div className="h-px" style={{ background: "var(--border)", width: `${Math.min(departments.length * 260, 1000)}px` }} />
      </div>

      {/* Departments */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => {
          const deptAgentList = deptAgents.get(dept.id) ?? [];
          const isExpanded = expanded.has(dept.short_id);

          return (
            <div key={dept.id} className="space-y-0">
              {/* Vertical connector */}
              <div className="flex justify-center">
                <div className="w-px h-6" style={{ background: "var(--border)" }} />
              </div>

              {/* Department card */}
              <div
                className="surface-card p-4 cursor-pointer"
                onClick={() => toggleExpand(dept.short_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{dept.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{dept.name}</p>
                      <div className={`h-2 w-2 rounded-full ${dept.status === "active" ? "dot-green" : "dot-amber"}`} />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-quiet)" }}>{deptAgentList.length} agent{deptAgentList.length !== 1 ? "s" : ""}</p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                  ) : (
                    <ChevronRight className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                  )}
                </div>
              </div>

              {/* Agents under department */}
              {isExpanded && deptAgentList.length > 0 && (
                <div className="ml-8 space-y-2 mt-2">
                  {/* Vertical line */}
                  <div className="relative">
                    <div className="absolute left-[-16px] top-0 bottom-0 w-px" style={{ background: "var(--border)" }} />
                    {deptAgentList.map((agent) => (
                      <div key={agent.id} className="relative mb-2">
                        {/* Horizontal connector */}
                        <div className="absolute left-[-16px] top-4 w-4 h-px" style={{ background: "var(--border)" }} />
                        <Link href={`/agents/${agent.id}`}>
                          <div className="surface-card-hover p-3 ml-2">
                            <div className="flex items-center gap-2.5">
                              <div className="relative">
                                <span className="text-lg">{agent.emoji}</span>
                                <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border ${agent.status === "active" ? "dot-green" : agent.status === "paused" ? "dot-amber" : "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
                                <p className="text-[11px] truncate" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && deptAgentList.length === 0 && (
                <div className="ml-8 mt-2">
                  <div className="relative">
                    <div className="absolute left-[-16px] top-0 bottom-0 w-px" style={{ background: "var(--border)" }} />
                    <div className="relative">
                      <div className="absolute left-[-16px] top-4 w-4 h-px" style={{ background: "var(--border)" }} />
                      <div className="rounded-lg border border-dashed p-3 ml-2 text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
                        No agents assigned
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Unassigned agents */}
      {unassigned.length > 0 && (
        <div className="mt-8">
          <div className="flex justify-center">
            <div className="w-px h-6" style={{ background: "var(--border)" }} />
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-quiet)" }}>
              Unassigned ({unassigned.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unassigned.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.id}`}>
                  <div className="surface-card-hover p-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{agent.name}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
