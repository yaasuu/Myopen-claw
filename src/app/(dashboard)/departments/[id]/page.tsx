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
  Bot,
  CheckCircle2,
  Clock,
  Pencil,
  Pause,
  Play,
} from "lucide-react";
import { getDepartmentById, updateDepartmentStatus, updateDepartmentProfile, getDepartmentPerformance } from "@/lib/data/departments";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { getFeedEvents } from "@/lib/data/feed";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Department, Agent, TaskWithAgent, FeedEvent } from "@/types/dashboard";

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

export default function DepartmentDetailPage() {
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const deptId = params.id as string;

  const [dept, setDept] = useState<Department | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editMandate, setEditMandate] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [deptResult, agentsResult, tasksResult, eventsResult] = await Promise.all([
        getDepartmentById(deptId),
        getAgents(),
        getTasks(),
        getFeedEvents(10),
      ]);
      if (deptResult.error) setError(deptResult.error);
      if (!deptResult.data) {
        setError("Department not found");
      } else {
        setDept(deptResult.data);
      }
      setAgents(agentsResult.data);
      setTasks(tasksResult.data);
      setEvents(eventsResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [deptId]);
  useRealtimeMulti(["agents", "tasks", "feed_events"], loadRef);

  useEffect(() => {
    load();
  }, [deptId]);

  if (loading) {
    return (
      <PageShell title="Department" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </PageShell>
    );
  }

  if (error && !dept) {
    return (
      <PageShell title="Department" description="Error">
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-[var(--danger)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button onClick={load} className="text-sm text-[var(--info)] hover:underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!dept) return null;

  // Match agents to this department by domain keyword
  const deptKeyword = dept.name.toLowerCase().split("-")[0];
  const deptAgents = agents.filter((a) =>
    a.domain.toLowerCase().includes(deptKeyword) || a.name.toLowerCase().includes(deptKeyword)
  );
  const agentIds = new Set(deptAgents.map((a) => a.id));
  const deptTasks = tasks.filter((t) => t.assigned_agent_id && agentIds.has(t.assigned_agent_id));
  const blockedTasks = deptTasks.filter((t) => t.status === "blocked");
  const completedTasks = deptTasks.filter((t) => t.status === "done");

  async function handleToggleStatus() {
    if (!dept) return;
    const newStatus = dept.status === "active" ? "paused" : "active";
    const result = await updateDepartmentStatus(dept.id, newStatus);
    if (result.data) setDept(result.data);
  }

  async function handleEditSave() {
    if (!dept) return;
    setEditing(true);
    const result = await updateDepartmentProfile(dept.id, {
      mandate: editMandate,
      domain: editDomain,
    });
    if (result.data) {
      setDept(result.data);
      setEditOpen(false);
    }
    setEditing(false);
  }

  return (
    <PageShell title={`${dept.emoji} ${dept.name}`} description="Department detail and performance">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">{error}</div>
      )}

      <Button variant="ghost" size="sm" className="gap-1.5 w-fit" onClick={() => router.push("/departments")}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Departments
      </Button>

      {/* Department header */}
      <Card className="stat-card">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-2xl">
                {dept.emoji}
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{dept.name}</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-lg">{dept.mandate}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className={`status-dot ${dept.status === "active" ? "dot-green" : "dot-amber"}`} />
                  <span className="text-xs text-muted-foreground capitalize">{dept.status}</span>
                  <Badge className="text-[10px]">{dept.priority} priority</Badge>
                </div>
              </div>
            </div>
            {canWrite && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  setEditMandate(dept.mandate);
                  setEditDomain(dept.domain);
                  setEditOpen(true);
                }}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                <Button variant={dept.status === "active" ? "outline" : "default"} size="sm" className="gap-1.5" onClick={handleToggleStatus}>
                  {dept.status === "active" ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Resume</>}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance snapshot */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="stat-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Tasks</p>
            <div className="text-2xl font-bold">{deptTasks.length}</div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Blocked</p>
            <div className={`text-2xl font-bold ${blockedTasks.length > 0 ? "text-[var(--danger)]" : ""}`}>{blockedTasks.length}</div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completed</p>
            <div className="text-2xl font-bold text-[var(--success)]">{completedTasks.length}</div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Agents</p>
            <div className="text-2xl font-bold">{deptAgents.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Agents */}
      <section>
        <h2 className="section-title mb-3">Assigned Agents</h2>
        <Card className="stat-card">
          <CardContent className="p-0">
            {deptAgents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No agents assigned to this department</div>
            ) : (
              <div className="divide-y">
                {deptAgents.map((agent) => (
                  <Link key={agent.id} href={`/agents/${agent.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                    <span className="text-xl">{agent.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{agent.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{agent.domain}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{agent.status}</Badge>
                    <span className="text-xs text-muted-foreground">{tasks.filter(t => t.assigned_agent_id === agent.id && t.status !== "done").length} open</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Tasks */}
      <section>
        <h2 className="section-title mb-3">Related Tasks</h2>
        <Card className="stat-card">
          <CardContent className="p-0">
            {deptTasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No tasks assigned to this department's agents</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-24">Agent</TableHead>
                    <TableHead className="w-32">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptTasks.slice(0, 10).map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium text-sm">{task.title}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${taskStatusColors[task.status]}`}>
                          {task.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{task.assigned_agent_emoji} {task.assigned_agent_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{timeAgo(task.updated_at)}</TableCell>
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

      {/* Edit dialog */}
      {canWrite && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Department</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mandate</label>
                <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={3} value={editMandate} onChange={(e) => setEditMandate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Domain</label>
                <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={editDomain} onChange={(e) => setEditDomain(e.target.value)} />
              </div>
              <Button onClick={handleEditSave} disabled={editing} className="w-full">
                {editing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
