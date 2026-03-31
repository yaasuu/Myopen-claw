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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  Target,
  FolderOpen,
} from "lucide-react";
import { getProjects, createProject } from "@/lib/data/projects";
import { getDepartments } from "@/lib/data/departments";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { ProjectWithStats, Department } from "@/types/dashboard";

const statusColors: Record<string, string> = {
  planning: "bg-transparent text-[var(--text-quiet)]",
  active: "bg-[rgba(59,130,246,0.08)] text-[var(--info)]",
  "on-hold": "bg-[rgba(245,158,11,0.08)] text-[var(--warning)]",
  completed: "bg-[rgba(16,185,129,0.08)] text-[var(--success)]",
  cancelled: "bg-transparent text-[var(--text-quiet)]",
};

const priorityColors: Record<string, string> = {
  high: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]",
  medium: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]",
  low: "bg-transparent text-[var(--text-quiet)]",
};

const STATUSES = ["all", "planning", "active", "on-hold", "completed", "cancelled"] as const;
const PRIORITIES = ["all", "high", "medium", "low"] as const;

export default function ProjectsPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newObjective, setNewObjective] = useState("");
  const [newScope, setNewScope] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projResult, deptResult] = await Promise.all([getProjects(), getDepartments()]);
      setProjects(projResult.data);
      setDepartments(deptResult.data);
      if (projResult.error) setError(projResult.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["projects", "tasks"], loadRef);

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const result = await createProject({
      title: newTitle.trim(),
      objective: newObjective.trim(),
      scope: newScope.trim(),
      department: newDept,
      priority: newPriority,
      dueDate: newDueDate || undefined,
    });
    if (result.error) setError(result.error);
    setCreateOpen(false);
    setNewTitle("");
    setNewObjective("");
    setNewScope("");
    setNewDept("");
    setNewPriority("medium");
    setNewDueDate("");
    setCreating(false);
    await load();
  }

  const filtered = projects.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterDept !== "all" && p.owner_department !== filterDept) return false;
    if (filterPriority !== "all" && p.priority !== filterPriority) return false;
    return true;
  });

  if (loading) {
    return (
      <PageShell title="Projects" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Projects" description="Project command center — execution units for Yas Claw">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">{error}</div>
      )}

      {/* Filters */}
      <div className="action-bar">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.emoji} {d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p === "all" ? "All priorities" : p}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {canWrite && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Project</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Project</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Title *</label>
                  <input className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Project title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Objective</label>
                  <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} placeholder="What is this project trying to achieve?" value={newObjective} onChange={(e) => setNewObjective(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Scope</label>
                  <textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} placeholder="What's in scope and what's not?" value={newScope} onChange={(e) => setNewScope(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Department</label>
                    <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newDept} onChange={(e) => setNewDept(e.target.value)}>
                      <option value="">Select...</option>
                      {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Priority</label>
                    <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newPriority} onChange={(e) => setNewPriority(e.target.value as "high" | "medium" | "low")}>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Due Date</label>
                    <input type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="w-full">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Create Project
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Projects grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <Card className="stat-card md:col-span-2 lg:col-span-3">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {projects.length === 0 ? "No projects yet — create one to get started" : "No projects match the current filters"}
            </CardContent>
          </Card>
        ) : (
          filtered.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="stat-card hover:shadow-md transition-all cursor-pointer h-full group">
                <CardContent className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge variant="outline" className="text-[10px] mb-2">{project.project_code}</Badge>
                      <p className="text-sm font-bold tracking-tight">{project.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{project.owner_department}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge className={`text-[10px] ${statusColors[project.status]}`}>{project.status}</Badge>
                      <Badge className={`text-[10px] ${priorityColors[project.priority]}`}>{project.priority}</Badge>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{project.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          project.progress >= 75 ? "dot-green" :
                          project.progress >= 50 ? "dot-blue" :
                          project.progress >= 25 ? "dot-amber" :
                          "dot-red"
                        }`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <div className="text-center">
                      <div className="text-sm font-bold">{project.open_tasks}</div>
                      <div className="text-[10px] text-muted-foreground">Open</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-bold ${project.blocked_tasks > 0 ? "text-[var(--danger)]" : ""}`}>{project.blocked_tasks}</div>
                      <div className="text-[10px] text-muted-foreground">Blocked</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-bold text-[var(--success)]">{project.completed_tasks}</div>
                      <div className="text-[10px] text-muted-foreground">Done</div>
                    </div>
                  </div>

                  {/* Due date */}
                  {project.due_date && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Due {new Date(project.due_date).toLocaleDateString()}
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    View project <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </PageShell>
  );
}
