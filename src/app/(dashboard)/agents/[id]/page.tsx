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
  Play,
  Pause,
  Clock,
  Activity,
  Pencil,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Award,
  BookOpen,
  Zap,
  Brain,
  Shield,
  ChevronRight,
} from "lucide-react";
import { getAgentById, updateAgentStatus, updateAgentProfile } from "@/lib/data/agents";
import { getTasksByAgent } from "@/lib/data/tasks";
import { getFeedEventsByAgent } from "@/lib/data/feed";
import { getAgentSkills } from "@/lib/data/skills";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, FeedEvent, AgentSkill } from "@/types/dashboard";

const statusColor: Record<string, string> = {
  active: "dot-green",
  paused: "dot-amber",
  retired: "dot-gray",
};

const taskStatusColors: Record<string, string> = {
  pending: "bg-transparent text-[var(--text-muted)]",
  "in-progress": "bg-[rgba(59,130,246,0.12)] text-[var(--info)]",
  blocked: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]",
  done: "bg-[rgba(16,185,129,0.12)] text-[var(--success)]",
};

const priorityColors: Record<string, string> = {
  high: "text-[var(--danger)]",
  medium: "text-[var(--warning)]",
  low: "text-[var(--text-quiet)]",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Agent memory data — structured focus areas and operating rules per agent
const AGENT_MEMORY: Record<string, { focusAreas: string[]; operatingRules: string[] }> = {
  "yas-claw": {
    focusAreas: [
      "Orchestration and task management",
      "Agent coordination and routing",
      "Approval and completion oversight",
      "Strategic decision support",
      "System health monitoring",
    ],
    operatingRules: [
      "Route work to specialist agents when domain-specific",
      "Synthesize outputs from multiple agents into one clear answer",
      "Define owner, blocker, priority, and next action on every task",
      "Monitor agent workload patterns and rebalance when needed",
      "Stay calm under pressure — simplify problems, define objectives",
    ],
  },
  "export-growth": {
    focusAreas: [
      "Export opportunities and lead generation",
      "Buyer follow-up and pipeline management",
      "Supplier readiness and document tracking",
      "Customs and compliance process clarity",
      "Shipment planning and execution support",
    ],
    operatingRules: [
      "Optimize for movement of real opportunities",
      "Track stage-based pipeline views for every active deal",
      "Surface blockers early — don't let opportunities stall",
      "Always identify next action, owner, and timeline",
      "Escalate to Yas Claw when task crosses into ops or systems",
    ],
  },
  "ops-improvement": {
    focusAreas: [
      "Workflow review and process improvement",
      "Routines, systems, and execution management",
      "AI and automation opportunity identification",
      "Financial planning and risk thinking",
      "Pricing logic and value proposition clarity",
    ],
    operatingRules: [
      "Reduce friction, strengthen routines, improve visibility",
      "Produce practical outputs — trackers, SOPs, memos",
      "Identify automation opportunities before manual solutions",
      "Frame decisions with pros, cons, risks, and recommendation",
      "Escalate export-pipeline tasks to Export-Growth agent",
    ],
  },
  "architecture-systems": {
    focusAreas: [
      "Orchestration architecture and platform design",
      "Data modeling and schema thinking",
      "Role and hierarchy design with permissions",
      "Workflow and state modeling",
      "Integration architecture and implementation sequencing",
    ],
    operatingRules: [
      "Favor structural clarity over unnecessary complexity",
      "Design for scalability without premature abstraction",
      "Define clear boundaries between components",
      "Reduce rework through better upfront architecture",
      "Translate messy platform ideas into phased implementation",
    ],
  },
};

function getAgentFocusAreas(shortId: string): string[] {
  return AGENT_MEMORY[shortId]?.focusAreas ?? ["No focus areas defined"];
}

function getAgentOperatingRules(shortId: string): string[] {
  return AGENT_MEMORY[shortId]?.operatingRules ?? ["No operating rules defined"];
}

export default function AgentDetailPage() {
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDomain, setEditDomain] = useState("");

  // Pause/resume confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agentResult, tasksResult, feedResult, skillsResult] = await Promise.all([
        getAgentById(agentId),
        getTasksByAgent(agentId),
        getFeedEventsByAgent(agentId, 5),
        getAgentSkills(agentId),
      ]);
      if (agentResult.error) {
        setError(agentResult.error);
      } else if (!agentResult.data) {
        setError("Agent not found");
      } else {
        setAgent(agentResult.data);
      }
      if (tasksResult.error && !tasksResult.error.includes("not connected")) {
        setError(tasksResult.error);
      }
      setTasks(tasksResult.data);
      setFeedEvents(feedResult.data);
      setAgentSkills(skillsResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [agentId]);
  useRealtimeMulti(["agents", "tasks", "feed_events"], loadRef);

  useEffect(() => {
    load();
  }, [agentId]);

  function openEdit() {
    if (!agent) return;
    setEditName(agent.name);
    setEditEmoji(agent.emoji);
    setEditDescription(agent.description);
    setEditDomain(agent.domain);
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!agent || !editName.trim()) return;
    setEditing(true);
    setError(null);
    try {
      const result = await updateAgentProfile(agent.id, {
        name: editName.trim(),
        emoji: editEmoji.trim() || agent.emoji,
        description: editDescription.trim(),
        domain: editDomain.trim(),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setAgent(result.data);
        setEditOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setEditing(false);
    }
  }

  async function handleToggleStatus() {
    if (!agent || agent.status === "retired") return;
    const newStatus = agent.status === "active" ? "paused" : "active";
    setToggling(true);
    setConfirmOpen(false);
    try {
      const result = await updateAgentStatus(agent.id, newStatus);
      if (result.error) {
        setError(result.error);
      } else {
        setAgent((prev) => (prev ? { ...prev, status: newStatus } : prev));
        // Refresh feed to show new event
        const feedResult = await getFeedEventsByAgent(agentId, 5);
        setFeedEvents(feedResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent status");
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="Agent" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading agent...
        </div>
      </PageShell>
    );
  }

  if (error && !agent) {
    return (
      <PageShell title="Agent" description="Error">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Failed to load agent</p>
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

  if (!agent) return null;

  const canToggle = canWrite && agent.status !== "retired";
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const completedTasks = tasks.filter((t) => t.status === "done");

  return (
    <PageShell
      title={`${agent.emoji} ${agent.name}`}
      description="Agent detail and task management"
    >
      {error && (
        <div className="rounded-md border border-amber-200 bg-[rgba(245,158,11,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
          {error}
        </div>
      )}

      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-1.5 w-fit" onClick={() => router.push("/agents")}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Agents
      </Button>

      {/* Agent profile card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-3">
              <span className="text-3xl">{agent.emoji}</span>
              <div>
                <div className="text-lg">{agent.name}</div>
                <div className="text-xs font-normal text-muted-foreground">{agent.short_id}</div>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${statusColor[agent.status]}`} />
                {agent.status}
              </Badge>
              {canToggle && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              )}
              {canToggle && (
                <Button
                  variant={agent.status === "active" ? "outline" : "default"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfirmOpen(true)}
                  disabled={toggling}
                >
                  {toggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : agent.status === "active" ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Domain</p>
              <p className="text-sm">{agent.domain || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-muted-foreground">{agent.description || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              <span>{agent.task_count} total tasks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Last activity: {timeAgo(agent.last_activity)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task insights */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Assigned Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
            <p className="text-xs text-muted-foreground">total assigned</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Blocked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--danger)]">{blockedTasks.length}</div>
            {blockedTasks.length > 0 ? (
              <Link href="/tasks" className="text-xs text-[var(--info)] hover:underline flex items-center gap-1">
                View in tasks <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">no blockers</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[var(--success)]">{completedTasks.length}</div>
            <p className="text-xs text-muted-foreground">tasks done</p>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Tasks */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Assigned Tasks</h2>
        <Card>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No tasks assigned to this agent
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-20">Priority</TableHead>
                    <TableHead className="w-32">Updated</TableHead>
                    <TableHead>Blocker</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${taskStatusColors[task.status]}`}>
                          {task.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${priorityColors[task.priority]}`}>
                          {task.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(task.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {task.blocker ? (
                          <span className="flex items-center gap-1 text-[var(--danger)]">
                            <AlertTriangle className="h-3 w-3" />
                            {task.blocker}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Recent agent activity */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Recent Activity</h2>
        <Card>
          <CardContent className="p-0">
            {feedEvents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No recent activity for this agent
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Type</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-36">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {event.event_type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{event.summary}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Skills */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="icon-box-sm" style={{ background: "rgba(59, 130, 246, 0.08)" }}>
            <Award className="h-3.5 w-3.5" style={{ color: "var(--info)" }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Installed Skills</h2>
          {agentSkills.length > 0 && (
            <Badge style={{ background: "rgba(59, 130, 246, 0.12)", color: "var(--info)" }} className="text-xs">
              {agentSkills.length}
            </Badge>
          )}
        </div>
        <Card>
          <CardContent className="p-5">
            {agentSkills.length === 0 ? (
              <div className="flex items-center gap-3 py-4">
                <Zap className="h-5 w-5" style={{ color: "var(--text-quiet)" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No skills installed</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Visit the Skills page to request capabilities for this agent</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {agentSkills.map((skill) => (
                  <div key={skill.skill_id || skill.skill_name} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                    <Award className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{skill.skill_name}</span>
                    <Badge variant="outline" className="text-[10px]">{skill.skill_category}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Agent Memory */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="icon-box-sm" style={{ background: "rgba(139, 92, 246, 0.08)" }}>
            <Brain className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Agent Memory</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Focus Areas */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" style={{ color: "var(--info)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Focus Areas</span>
              </div>
              <div className="space-y-2">
                {getAgentFocusAreas(agent.short_id).map((area, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--success)" }} />
                    <span>{area}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Operating Rules */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>Operating Rules</span>
              </div>
              <div className="space-y-2">
                {getAgentOperatingRules(agent.short_id).map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-[60px_1fr] gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Emoji</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-center"
                  placeholder="🤖"
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Agent name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Domain</label>
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="e.g. Export execution, lead generation"
                value={editDomain}
                onChange={(e) => setEditDomain(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                placeholder="What this agent handles"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <Button onClick={handleEditSave} disabled={editing || !editName.trim()} className="w-full">
              {editing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pause/Resume confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {agent.status === "active" ? "Pause Agent?" : "Resume Agent?"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {agent.status === "active"
                ? `Are you sure you want to pause ${agent.emoji} ${agent.name}? It will stop receiving new tasks.`
                : `Are you sure you want to resume ${agent.emoji} ${agent.name}? It will become active again.`}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5"
                variant={agent.status === "active" ? "outline" : "default"}
                onClick={handleToggleStatus}
                disabled={toggling}
              >
                {toggling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : agent.status === "active" ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    Pause Agent
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Resume Agent
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
