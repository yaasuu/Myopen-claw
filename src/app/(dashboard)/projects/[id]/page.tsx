"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Clock,
  CheckCircle2,
  Target,
  FolderOpen,
  ChevronRight,
  Users,
  Bot,
  Sparkles,
  AlertOctagon,
  CheckCircle,
  Zap,
  Activity,
  Flag,
  MessageSquare,
  Shield,
} from "lucide-react";
import { getProjectById, updateProject, applyProjectPlan } from "@/lib/data/projects";
import { generateProjectPlan } from "@/lib/data/planning";
import {
  calculateProjectHealth,
  getProjectMilestones,
  getProjectReviews,
  getProjectDecisions,
  createProjectReview,
  createProjectMilestone,
  updateProjectMilestone,
} from "@/lib/data/governance";
import { getAgents } from "@/lib/data/agents";
import { getSpecialistTypes } from "@/lib/data/departments";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Project, TaskWithAgent, FeedEvent, ProjectMilestone, ProjectReview, ProjectDecision, ProjectHealthScore } from "@/types/dashboard";

const statusColors: Record<string, string> = {
  planning: "bg-transparent text-[var(--text-quiet)]",
  active: "bg-[rgba(59,130,246,0.08)] text-[var(--info)]",
  "on-hold": "bg-[rgba(245,158,11,0.08)] text-[var(--warning)]",
  completed: "bg-[rgba(16,185,129,0.08)] text-[var(--success)]",
  cancelled: "bg-transparent text-[var(--text-quiet)]",
};

const taskStatusColors: Record<string, string> = {
  pending: "bg-transparent text-[var(--text-quiet)] border-[var(--border)]",
  "in-progress": "bg-[rgba(59,130,246,0.08)] text-[var(--info)] border-blue-200",
  blocked: "bg-[rgba(239,68,68,0.08)] text-[var(--danger)] border-red-200",
  done: "bg-[rgba(16,185,129,0.08)] text-[var(--success)] border-emerald-200",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProjectDetailPage() {
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<ReturnType<typeof generateProjectPlan> | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [health, setHealth] = useState<ProjectHealthScore | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [reviews, setReviews] = useState<ProjectReview[]>([]);
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editProgress, setEditProgress] = useState(0);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [result, agentsResult, specResult] = await Promise.all([
        getProjectById(projectId),
        getAgents(),
        getSpecialistTypes(),
      ]);
      if (result.error) setError(result.error);
      setProject(result.data);
      setTasks(result.tasks);
      setEvents(result.events);

      // Generate plan + governance
      if (result.data) {
        setPlan(generateProjectPlan(result.data, agentsResult.data, result.tasks, specResult.data));
        setHealth(calculateProjectHealth(result.data, result.tasks, []));

        // Load governance data
        const [msResult, rvResult, dcResult] = await Promise.all([
          getProjectMilestones(projectId),
          getProjectReviews(projectId),
          getProjectDecisions(projectId),
        ]);
        setMilestones(msResult.data);
        setReviews(rvResult.data);
        setDecisions(dcResult.data);

        // Recalculate health with milestones
        setHealth(calculateProjectHealth(result.data, result.tasks, msResult.data));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [projectId]);
  useRealtimeMulti(["projects", "tasks", "feed_events"], loadRef);

  useEffect(() => { load(); }, [projectId]);

  async function handleEditSave() {
    if (!project) return;
    setEditing(true);
    const result = await updateProject(project.id, {
      status: editStatus as Project["status"],
      progress: editProgress,
    });
    if (result.data) {
      setProject(result.data);
      setEditOpen(false);
    }
    if (result.error) setError(result.error);
    setEditing(false);
  }

  if (loading) {
    return (
      <PageShell title="Project" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      </PageShell>
    );
  }

  if (error && !project) {
    return (
      <PageShell title="Project" description="Error">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div className="flex-1"><p className="text-sm font-medium">{error}</p></div>
            <button onClick={load} className="text-sm text-[var(--info)] hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!project) return null;

  const openTasks = tasks.filter((t) => t.status !== "done");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const completedTasks = tasks.filter((t) => t.status === "done");

  return (
    <PageShell title={`${project.project_code} — ${project.title}`} description="Project brief and execution tracking">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">{error}</div>
      )}

      <Button variant="ghost" size="sm" className="gap-1.5 w-fit" onClick={() => router.push("/projects")}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
      </Button>

      {/* Project brief */}
      <Card className="stat-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{project.project_code}</Badge>
                <Badge className={`text-xs ${statusColors[project.status]}`}>{project.status}</Badge>
                <Badge className={`text-xs ${
                  project.priority === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                  project.priority === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                  "bg-transparent text-[var(--text-quiet)]"
                }`}>{project.priority}</Badge>
              </div>
              <h2 className="text-lg font-bold tracking-tight">{project.title}</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">{project.objective}</p>
            </div>
            {canWrite && (
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => {
                setEditStatus(project.status);
                setEditProgress(project.progress);
                setEditOpen(true);
              }}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>

          {/* Progress */}
          <div className="space-y-1.5 max-w-md">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{project.progress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${
                project.progress >= 75 ? "dot-green" :
                project.progress >= 50 ? "dot-blue" :
                project.progress >= 25 ? "dot-amber" :
                "dot-red"
              }`} style={{ width: `${project.progress}%` }} />
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> {project.owner_department}</span>
            {project.due_date && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Due {new Date(project.due_date).toLocaleDateString()}</span>}
            <span>Updated {timeAgo(project.updated_at)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="stat-card"><CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Open Tasks</p>
          <div className="text-2xl font-bold">{openTasks.length}</div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Blocked</p>
          <div className={`text-2xl font-bold ${blockedTasks.length > 0 ? "text-[var(--danger)]" : ""}`}>{blockedTasks.length}</div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completed</p>
          <div className="text-2xl font-bold text-[var(--success)]">{completedTasks.length}</div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total</p>
          <div className="text-2xl font-bold">{tasks.length}</div>
        </CardContent></Card>
      </div>

      {/* Scope + Deliverables + Success Criteria */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="stat-card">
          <CardHeader className="pb-2 px-5 pt-5"><CardTitle className="section-title">Scope</CardTitle></CardHeader>
          <CardContent className="px-5 pb-5"><p className="text-sm text-muted-foreground">{project.scope || "Not defined"}</p></CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2 px-5 pt-5"><CardTitle className="section-title">Deliverables</CardTitle></CardHeader>
          <CardContent className="px-5 pb-5">
            {project.deliverables.length > 0 ? (
              <ul className="space-y-1.5">
                {project.deliverables.map((d, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-blue-500" /> {d}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">None defined</p>}
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2 px-5 pt-5"><CardTitle className="section-title">Success Criteria</CardTitle></CardHeader>
          <CardContent className="px-5 pb-5">
            {project.success_criteria.length > 0 ? (
              <ul className="space-y-1.5">
                {project.success_criteria.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" /> {s}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">None defined</p>}
          </CardContent>
        </Card>
      </div>

      {/* Plan Project */}
      {plan && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <h2 className="section-title">Execution Plan</h2>
              <Badge className={`text-xs ${
                plan.riskLevel === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                plan.riskLevel === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                "bg-[rgba(16,185,129,0.12)] text-[var(--success)]"
              }`}>{plan.riskLevel} risk</Badge>
            </div>
            {canWrite && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
                  <RefreshCw className="h-3 w-3" /> Regenerate
                </Button>
                <Button size="sm" className="gap-1.5" disabled={applyingPlan} onClick={async () => {
                  if (!project) return;
                  setApplyingPlan(true);
                  await applyProjectPlan(project.id, {
                    department: plan.department,
                    taskTitles: plan.tasks.map((t) => ({
                      title: t.title,
                      priority: t.priority,
                      agentId: t.suggestedAgentId,
                    })),
                  });
                  setApplyingPlan(false);
                  await load();
                }}>
                  {applyingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Apply Plan
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Department + Risk */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recommended Department</p>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-semibold">{plan.department}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.departmentReason}</p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Risk Assessment</p>
                  <div className="flex items-center gap-2">
                    {plan.riskLevel === "high" ? <AlertOctagon className="h-4 w-4 text-red-500" /> :
                     plan.riskLevel === "medium" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                     <CheckCircle className="h-4 w-4 text-emerald-500" />}
                    <span className={`text-sm font-semibold ${
                      plan.riskLevel === "high" ? "text-[var(--danger)]" :
                      plan.riskLevel === "medium" ? "text-[var(--warning)]" :
                      "text-[var(--success)]"
                    }`}>{plan.riskLevel.charAt(0).toUpperCase() + plan.riskLevel.slice(1)} Risk</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.riskReason}</p>
                  <p className="text-xs text-muted-foreground mt-1">Capacity: {plan.capacitySignal}</p>
                </div>
              </CardContent>
            </Card>

            {/* Agent Recommendations */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Agent Recommendations</p>
                {plan.agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matching active agents found. Consider hiring.</p>
                ) : (
                  <div className="space-y-2.5">
                    {plan.agents.map((pa) => (
                      <div key={pa.agent.id} className={`flex items-center gap-3 rounded-lg border p-3 ${pa.recommended ? "border-primary/30 bg-primary/5" : "opacity-60"}`}>
                        <span className="text-lg">{pa.agent.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{pa.agent.name}</p>
                            {pa.recommended && <Badge className="text-[10px] bg-primary/10 text-primary">Recommended</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{pa.reason} · {pa.currentLoad} open tasks</p>
                        </div>
                        <div className={`h-2 w-2 rounded-full ${pa.currentLoad >= 5 ? "dot-red" : pa.currentLoad >= 3 ? "dot-amber" : "dot-green"}`} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Specialist Recommendations */}
            {plan.specialists.length > 0 && (
              <Card className="stat-card">
                <CardContent className="p-5 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Specialist Recommendations</p>
                  <div className="space-y-2.5">
                    {plan.specialists.map((spec, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{spec.typeName}</p>
                          <p className="text-xs text-muted-foreground">{spec.reason}</p>
                        </div>
                        <Badge className={`text-[10px] ${
                          spec.urgency === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                          spec.urgency === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                          "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                        }`}>{spec.urgency}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Starter Tasks */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Starter Tasks ({plan.tasks.length})</p>
                <div className="space-y-2">
                  {plan.tasks.map((task, i) => {
                    const catColors: Record<string, string> = {
                      setup: "bg-transparent text-[var(--text-quiet)]",
                      execution: "bg-[rgba(59,130,246,0.08)] text-[var(--info)]",
                      validation: "bg-[rgba(139,92,246,0.08)] text-[var(--accent)]",
                      reporting: "bg-[rgba(16,185,129,0.08)] text-[var(--success)]",
                    };
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`text-[10px] ${catColors[task.category]}`}>{task.category}</Badge>
                            <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
                            {task.suggestedAgentId && <Badge variant="outline" className="text-[10px]">auto-assign</Badge>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Tasks */}
      <section>
        <h2 className="section-title mb-3">Linked Tasks</h2>
        <Card className="stat-card">
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No tasks linked to this project</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24">Agent</TableHead>
                    <TableHead className="w-32">Updated</TableHead>
                    <TableHead>Blocker</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium text-sm">{task.title}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${taskStatusColors[task.status]}`}>{task.status}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {task.assigned_agent_name ? <span>{task.assigned_agent_emoji} {task.assigned_agent_name}</span> : <span className="text-muted-foreground italic">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(task.updated_at)}</TableCell>
                      <TableCell className="text-xs">
                        {task.blocker ? <span className="text-[var(--danger)] flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {task.blocker}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="section-title mb-3">Recent Activity</h2>
        <Card className="stat-card">
          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No recent activity</div>
            ) : (
              <div className="divide-y">
                {events.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="text-xs text-muted-foreground w-14 shrink-0">{timeAgo(event.created_at)}</span>
                    <p className="text-sm text-muted-foreground">{event.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Governance */}
      {health && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
                <Shield className="h-4 w-4 text-[var(--accent)]" />
              </div>
              <h2 className="section-title">Governance</h2>
              <Badge className={`text-xs ${
                health.status === "healthy" ? "bg-[rgba(16,185,129,0.12)] text-[var(--success)]" :
                health.status === "watch" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                health.status === "at_risk" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]"
              }`}>{health.status.replace("_", " ")}</Badge>
            </div>
            {canWrite && (
              <div className="flex gap-2">
                {(["weekly", "executive", "risk"] as const).map((type) => (
                  <Button key={type} variant="outline" size="sm" className="gap-1.5 text-xs capitalize" onClick={async () => {
                    if (!project) return;
                    const summary = prompt(`${type} review summary:`);
                    if (summary) {
                      await createProjectReview({
                        projectId: project.id,
                        reviewType: type,
                        summary,
                        blockers: tasks.filter((t) => t.status === "blocked").map((t) => t.title),
                      });
                      await load();
                    }
                  }}>
                    <Activity className="h-3 w-3" /> {type}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Escalation banner */}
          {health.escalationNeeded && (
            <Card className="border-red-200 bg-[rgba(239,68,68,0.08)] mb-4">
              <CardContent className="flex items-center gap-3 py-4 px-5">
                <AlertOctagon className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Escalation Required</p>
                  <p className="text-xs text-[var(--danger)]">{health.escalationReason}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Health Score */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Health Score</p>
                  <div className={`text-2xl font-bold ${
                    health.score >= 75 ? "text-[var(--success)]" :
                    health.score >= 50 ? "text-[var(--warning)]" :
                    health.score >= 25 ? "text-[var(--warning)]" :
                    "text-[var(--danger)]"
                  }`}>{health.score}/100</div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${
                    health.score >= 75 ? "dot-green" :
                    health.score >= 50 ? "dot-amber" :
                    health.score >= 25 ? "dot-amber" :
                    "dot-red"
                  }`} style={{ width: `${health.score}%` }} />
                </div>
                <div className="space-y-2">
                  {health.factors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className={`font-medium ${
                        f.severity === "good" ? "text-[var(--success)]" :
                        f.severity === "warn" ? "text-[var(--warning)]" :
                        "text-[var(--danger)]"
                      }`}>{f.impact}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Milestones */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Milestones</p>
                  {canWrite && (
                    <Button variant="ghost" size="xs" className="text-[10px] h-6" onClick={async () => {
                      if (!project) return;
                      const title = prompt("Milestone title:");
                      if (title) {
                        await createProjectMilestone({ projectId: project.id, title });
                        await load();
                      }
                    }}>+ Add</Button>
                  )}
                </div>
                {milestones.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No milestones</p>
                ) : (
                  <div className="space-y-2">
                    {milestones.map((ms) => {
                      const msColors: Record<string, string> = {
                        done: "border-l-emerald-500",
                        in_progress: "border-l-blue-500",
                        pending: "border-l-slate-300",
                        missed: "border-l-red-500",
                      };
                      return (
                        <div key={ms.id} className={`rounded-lg border border-l-4 ${msColors[ms.status]} p-3`}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{ms.title}</p>
                            <Badge className={`text-[10px] ${
                              ms.status === "done" ? "bg-[rgba(16,185,129,0.08)] text-[var(--success)]" :
                              ms.status === "in_progress" ? "bg-[rgba(59,130,246,0.08)] text-[var(--info)]" :
                              ms.status === "missed" ? "bg-[rgba(239,68,68,0.08)] text-[var(--danger)]" :
                              "bg-transparent text-[var(--text-quiet)]"
                            }`}>{ms.status.replace("_", " ")}</Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {ms.due_date && <span>Due {new Date(ms.due_date).toLocaleDateString()}</span>}
                            {ms.owner && <span>{ms.owner}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reviews */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Reviews</p>
                {reviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No reviews yet</p>
                ) : (
                  <div className="space-y-3">
                    {reviews.slice(0, 3).map((rv) => (
                      <div key={rv.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] capitalize">{rv.review_type}</Badge>
                          <span className="text-[10px] text-muted-foreground">{new Date(rv.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{rv.summary}</p>
                        {rv.blockers.length > 0 && (
                          <p className="text-xs text-[var(--danger)]">Blockers: {rv.blockers.join(", ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Decision Log */}
            <Card className="stat-card">
              <CardContent className="p-5 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Decision Log</p>
                {decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No decisions logged</p>
                ) : (
                  <div className="space-y-3">
                    {decisions.map((dc) => (
                      <div key={dc.id} className="rounded-lg border p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{dc.title}</p>
                          <Badge className={`text-[10px] ${
                            dc.impact_level === "high" ? "bg-[rgba(239,68,68,0.08)] text-[var(--danger)]" :
                            dc.impact_level === "medium" ? "bg-[rgba(245,158,11,0.08)] text-[var(--warning)]" :
                            "bg-[rgba(59,130,246,0.08)] text-[var(--info)]"
                          }`}>{dc.impact_level}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{dc.summary}</p>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>{dc.decided_by}</span>
                          <span>·</span>
                          <span>{new Date(dc.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Edit dialog */}
      {canWrite && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Update Project</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  {["planning", "active", "on-hold", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Progress: {editProgress}%</label>
                <input type="range" min="0" max="100" className="mt-1 w-full" value={editProgress} onChange={(e) => setEditProgress(Number(e.target.value))} />
              </div>
              <Button onClick={handleEditSave} disabled={editing} className="w-full">
                {editing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
