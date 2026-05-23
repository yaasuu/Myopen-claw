"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  UserPlus,
  Zap,
  ArrowRight,
  Users,
  CheckCircle2,
  Clock,
  Bot,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { getAgents, createAgent, updateAgentStatus } from "@/lib/data/agents";
import { getTasks, updateTaskAssignment } from "@/lib/data/tasks";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import {
  analyzeHiringNeeds,
  getUnassignedTasks,
  getAgentCapacity,
  type HiringRecommendation,
} from "@/lib/data/hiring";
import type { Agent, TaskWithAgent } from "@/types/dashboard";

const urgencyStyles: Record<string, { badge: string; border: string }> = {
  high: { badge: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]", border: "border-l-red-500" },
  medium: { badge: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]", border: "border-l-amber-500" },
  low: { badge: "bg-[rgba(59,130,246,0.12)] text-[var(--info)]", border: "border-l-blue-400" },
};

const actionLabels: Record<string, { label: string; icon: typeof UserPlus }> = {
  hire_new: { label: "Hire Agent", icon: UserPlus },
  activate_existing: { label: "Activate Agent", icon: Zap },
  auto_assign: { label: "Assign Tasks", icon: ArrowRight },
  dismiss: { label: "Dismiss", icon: XCircle },
};

const loadStyles: Record<string, { color: string; bg: string; label: string }> = {
  light: { color: "text-[var(--success)]", bg: "bg-[rgba(16,185,129,0.08)]", label: "Light" },
  moderate: { color: "text-[var(--warning)]", bg: "bg-[rgba(245,158,11,0.08)]", label: "Moderate" },
  heavy: { color: "text-[var(--danger)]", bg: "bg-[rgba(239,68,68,0.08)]", label: "Heavy" },
};

export default function HiringPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [recommendations, setRecommendations] = useState<HiringRecommendation[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Hire dialog
  const [hireOpen, setHireOpen] = useState(false);
  const [hireRec, setHireRec] = useState<HiringRecommendation | null>(null);
  const [hireName, setHireName] = useState("");
  const [hireEmoji, setHireEmoji] = useState("");
  const [hireDomain, setHireDomain] = useState("");
  const [hireDesc, setHireDesc] = useState("");
  const [hireAutoAssign, setHireAutoAssign] = useState(false);
  const [hireSuccess, setHireSuccess] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agentsResult, tasksResult] = await Promise.all([getAgents(), getTasks()]);
      if (agentsResult.error) setError(agentsResult.error);
      if (tasksResult.error) setError(tasksResult.error);
      setAgents(agentsResult.data);
      setTasks(tasksResult.data);
      setRecommendations(analyzeHiringNeeds(tasksResult.data, agentsResult.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "agents"], loadRef);

  useEffect(() => {
    load();
  }, []);

  function openHireDialog(rec: HiringRecommendation) {
    setHireRec(rec);
    setHireName(rec.suggestedName);
    setHireEmoji(rec.suggestedEmoji);
    setHireDomain(rec.suggestedDomain);
    setHireDesc(rec.explanation);
    setHireAutoAssign(false);
    setHireSuccess(false);
    setHireOpen(true);
  }

  async function handleHire() {
    if (!hireRec || !hireName.trim()) return;
    setProcessing(hireRec.id);
    try {
      const result = await createAgent({
        name: hireName.trim(),
        emoji: hireEmoji.trim() || "🤖",
        description: hireDesc.trim(),
        domain: hireDomain.trim(),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setHireSuccess(true);
        // Auto-assign matching tasks if checked
        if (hireAutoAssign && result.data && hireRec.matchedTaskIds.length > 0) {
          for (const taskId of hireRec.matchedTaskIds) {
            await updateTaskAssignment(taskId, result.data.id);
          }
        }
        setTimeout(() => {
          setHireOpen(false);
          load();
        }, 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hire agent");
    } finally {
      setProcessing(null);
    }
  }

  async function handleActivate(rec: HiringRecommendation) {
    if (!rec.existingAgent) return;
    setProcessing(rec.id);
    try {
      const result = await updateAgentStatus(rec.existingAgent.id, "active");
      if (result.error) {
        setError(result.error);
      } else {
        // Auto-assign matching tasks
        if (rec.matchedTaskIds.length > 0) {
          for (const taskId of rec.matchedTaskIds) {
            await updateTaskAssignment(taskId, rec.existingAgent!.id);
          }
        }
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate agent");
    } finally {
      setProcessing(null);
    }
  }

  async function handleAutoAssign(rec: HiringRecommendation) {
    if (!rec.existingAgent) return;
    setProcessing(rec.id);
    try {
      for (const taskId of rec.matchedTaskIds) {
        await updateTaskAssignment(taskId, rec.existingAgent!.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign tasks");
    } finally {
      setProcessing(null);
    }
  }

  function handleDismiss(rec: HiringRecommendation) {
    setDismissed((prev) => new Set(prev).add(rec.id));
  }

  const visibleRecommendations = recommendations.filter((r) => !dismissed.has(r.id));

  const unassigned = getUnassignedTasks(tasks);
  const capacity = getAgentCapacity(tasks, agents);

  if (loading) {
    return (
      <PageShell title="Hiring" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing hiring needs...
        </div>
      </PageShell>
    );
  }

  if (error && agents.length === 0) {
    return (
      <PageShell title="Hiring" description="Error loading data">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-[var(--info)] hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
            <UserPlus className="h-6 w-6" style={{ color: "var(--accent)" }} />
            Hiring
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Strategic agent hiring · workload-driven recommendations
          </p>
        </div>
        {visibleRecommendations.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5"
               style={{ borderColor: "rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.06)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "#8b5cf6" }} />
            <span className="text-xs font-semibold" style={{ color: "#8b5cf6" }}>
              {visibleRecommendations.length} recommendation{visibleRecommendations.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Section A: Hiring Recommendations */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
            <TrendingUp className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <h2 className="section-title">Hiring Recommendations</h2>
          {visibleRecommendations.length > 0 && (
            <Badge className="bg-[rgba(139,92,246,0.12)] text-[var(--accent)] text-xs">{visibleRecommendations.length}</Badge>
          )}
        </div>

        {visibleRecommendations.length === 0 ? (
          <Card className="stat-card">
            <CardContent className="flex items-center gap-3 py-8 px-5">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">All clear</p>
                <p className="text-xs text-muted-foreground">No hiring recommendations at this time. Workforce is well-balanced.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleRecommendations.map((rec) => {
              const urg = urgencyStyles[rec.urgency];
              const act = actionLabels[rec.action];
              const ActIcon = act.icon;

              return (
                <Card key={rec.id} className={`stat-card border-l-4 ${urg.border}`}>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{rec.suggestedEmoji}</span>
                        <div>
                          <p className="text-sm font-semibold">{rec.suggestedName}</p>
                          <p className="text-xs text-muted-foreground">{rec.suggestedDomain}</p>
                          <Badge variant="outline" className="text-[10px] mt-1">{rec.department}</Badge>
                        </div>
                      </div>
                      <Badge className={`text-xs ${urg.badge}`}>{rec.urgency}</Badge>
                    </div>

                    <p className="text-sm text-muted-foreground">{rec.explanation}</p>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {rec.matchedTaskCount} task{rec.matchedTaskCount !== 1 ? "s" : ""}
                        </span>
                        {rec.blockedTaskCount > 0 && (
                          <span className="flex items-center gap-1 text-[var(--danger)]">
                            <AlertTriangle className="h-3 w-3" />
                            {rec.blockedTaskCount} blocked
                          </span>
                        )}
                      </div>

                      {canWrite && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={rec.action === "hire_new" ? "default" : "outline"}
                            className="gap-1.5"
                            disabled={processing === rec.id}
                            onClick={() => {
                              if (rec.action === "hire_new") openHireDialog(rec);
                              else if (rec.action === "activate_existing") handleActivate(rec);
                              else handleAutoAssign(rec);
                            }}
                          >
                            {processing === rec.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ActIcon className="h-3.5 w-3.5" />
                            )}
                            {act.label}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-muted-foreground"
                            onClick={() => handleDismiss(rec)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Section B: Unassigned Tasks */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(245,158,11,0.08)]">
            <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
          </div>
          <h2 className="section-title">Unassigned Tasks</h2>
          {unassigned.length > 0 && (
            <Badge className="bg-[rgba(245,158,11,0.12)] text-[var(--warning)] text-xs">{unassigned.length}</Badge>
          )}
        </div>

        <Card className="stat-card">
          <CardContent className="p-0">
            {unassigned.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                All tasks have an agent assigned
              </div>
            ) : (
              <div className="divide-y">
                {unassigned.map((task) => (
                  <div key={task.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.priority} priority · created {new Date(task.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">Unassigned</Badge>
                    <Link href="/tasks">
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section C: Agent Capacity */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.08)]">
            <Bot className="h-4 w-4 text-blue-500" />
          </div>
          <h2 className="section-title">Agent Capacity Snapshot</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capacity.map(({ agent, openTasks, blockedTasks, load }) => {
            const ls = loadStyles[load];
            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="stat-card hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{agent.emoji}</span>
                        <div>
                          <p className="text-sm font-semibold">{agent.name}</p>
                          <Badge variant="outline" className={`text-[10px] ${agent.status === "active" ? "" : "opacity-60"}`}>
                            {agent.status}
                          </Badge>
                        </div>
                      </div>
                      <Badge className={`text-xs ${ls.bg} ${ls.color}`}>
                        {ls.label}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                        <div className="text-lg font-bold">{openTasks}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Open</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                        <div className={`text-lg font-bold ${blockedTasks > 0 ? "text-[var(--danger)]" : ""}`}>{blockedTasks}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Blocked</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Section D: Recently Hired / Activated */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.08)]">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <h2 className="section-title">Active Workforce</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const agentTasks = tasks.filter((t) => t.assigned_agent_id === agent.id && t.status !== "done");
            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="stat-card hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{agent.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{agent.domain}</p>
                      </div>
                      <div className={`status-dot ${agent.status === "active" ? "dot-green" : "dot-amber"}`} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {agentTasks.length} open
                      </span>
                      <span>{agent.status}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Hire Dialog */}
      {canWrite && (
        <Dialog open={hireOpen} onOpenChange={setHireOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{hireSuccess ? "Agent Hired ✓" : "Hire New Agent"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {hireSuccess ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  <p className="text-sm font-medium text-[var(--success)]">Agent created and active</p>
                  {hireAutoAssign && hireRec && (
                    <p className="text-xs text-muted-foreground">
                      {hireRec.matchedTaskIds.length} task{hireRec.matchedTaskIds.length !== 1 ? "s" : ""} assigned automatically
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[60px_1fr] gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Emoji</label>
                      <input
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-center"
                        value={hireEmoji}
                        onChange={(e) => setHireEmoji(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Name *</label>
                      <input
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={hireName}
                        onChange={(e) => setHireName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Domain</label>
                    <input
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={hireDomain}
                      onChange={(e) => setHireDomain(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Description</label>
                    <textarea
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      rows={3}
                      value={hireDesc}
                      onChange={(e) => setHireDesc(e.target.value)}
                    />
                  </div>
                  {hireRec && hireRec.matchedTaskIds.length > 0 && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hireAutoAssign}
                        onChange={(e) => setHireAutoAssign(e.target.checked)}
                        className="rounded"
                      />
                      <span>Assign {hireRec.matchedTaskIds.length} matching {hireRec.matchedTaskIds.length !== 1 ? "tasks" : "task"} automatically</span>
                    </label>
                  )}
                  <Button onClick={handleHire} disabled={!hireName.trim()} className="w-full gap-2">
                    <UserPlus className="h-4 w-4" />
                    Hire Agent
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
