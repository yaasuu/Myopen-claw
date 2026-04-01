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
  Bot,
  Activity,
  Clock,
  ChevronRight,
  Pause,
  Play,
  Pencil,
  FileText,
  Users,
} from "lucide-react";
import { getAgents, updateAgentStatus } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { getAgentWorkspace, getWorkspaceFiles } from "@/lib/data/workspace";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, AgentWorkspace, WorkspaceFile } from "@/types/dashboard";

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

const departments = [
  { name: "Orchestrator", emoji: "🦀", agents: ["yas-claw"] },
  { name: "Export-Growth", emoji: "📦", agents: ["export-growth"] },
  { name: "Ops-Improvement", emoji: "⚙️", agents: ["ops-improvement"] },
  { name: "Architecture-Systems", emoji: "🏗️", agents: ["architecture-systems"] },
];

export default function AgentsPage() {
  const canWrite = useCanWrite();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<AgentWorkspace | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<WorkspaceFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("SOUL.md");
  const [toggling, setToggling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agentsResult, tasksResult] = await Promise.all([getAgents(), getTasks()]);
      setAgents(agentsResult.data);
      setTasks(tasksResult.data);
      if (agentsResult.error) setError(agentsResult.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "tasks"], loadRef);

  useEffect(() => { load(); }, []);

  function selectAgent(agent: Agent) {
    setSelectedAgent(agent);
    const ws = getAgentWorkspace(agent, tasks);
    setSelectedWorkspace(ws);
    setSelectedFiles(getWorkspaceFiles(ws));
    setActiveFile("SOUL.md");
  }

  async function handleToggleStatus() {
    if (!selectedAgent || selectedAgent.status === "retired") return;
    const newStatus = selectedAgent.status === "active" ? "paused" : "active";
    setToggling(true);
    const result = await updateAgentStatus(selectedAgent.id, newStatus);
    if (result.data) {
      setSelectedAgent(result.data);
      setAgents((prev) => prev.map((a) => a.id === result.data!.id ? result.data! : a));
    }
    setToggling(false);
  }

  if (loading) {
    return (
      <PageShell title="Agents" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents...
        </div>
      </PageShell>
    );
  }

  const activeCount = agents.filter((a) => a.status === "active").length;
  const pausedCount = agents.filter((a) => a.status === "paused").length;

  return (
    <PageShell title="Agents & Workforce" description="Organization hierarchy and agent workspaces">
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>{error}</div>
      )}

      {/* Top metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Total Agents", value: String(agents.length), color: "var(--text)" },
          { label: "Active", value: String(activeCount), color: "var(--success)" },
          { label: "Paused", value: String(pausedCount), color: pausedCount > 0 ? "var(--warning)" : "var(--text-quiet)" },
          { label: "Tasks Assigned", value: String(tasks.filter((t) => t.assigned_agent_id && t.status !== "done").length), color: "var(--accent)" },
        ].map((m) => (
          <div key={m.label} className="surface-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{m.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Split layout: hierarchy + workspace */}
      <div className="flex gap-4" style={{ minHeight: "500px" }}>
        {/* Left: Hierarchy browser */}
        <div className="w-[260px] shrink-0 rounded-xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Organization</p>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto" style={{ maxHeight: "450px" }}>
            {departments.map((dept) => {
              const deptAgents = agents.filter((a) => dept.agents.includes(a.short_id));
              return (
                <div key={dept.name}>
                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-quiet)" }}>
                    <span>{dept.emoji}</span>
                    {dept.name}
                  </div>
                  {deptAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => selectAgent(agent)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                        selectedAgent?.id === agent.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-muted)]"
                      }`}
                    >
                      <div className="relative">
                        <span className="text-base">{agent.emoji}</span>
                        <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border ${agent.status === "active" ? "dot-green" : agent.status === "paused" ? "dot-amber" : "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: selectedAgent?.id === agent.id ? "var(--accent)" : "var(--text)" }}>{agent.name}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected agent workspace */}
        <div className="flex-1">
          {!selectedAgent ? (
            <div className="flex items-center justify-center h-full rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }}>
              <div className="text-center">
                <Bot className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--text-quiet)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Select an agent</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>Choose an agent from the hierarchy to view their workspace</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Agent header */}
              <div className="surface-card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <span className="text-3xl">{selectedAgent.emoji}</span>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${selectedAgent.status === "active" ? "dot-green" : selectedAgent.status === "paused" ? "dot-amber" : "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{selectedAgent.name}</h2>
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{selectedAgent.domain}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{selectedAgent.status}</Badge>
                    </div>
                  </div>
                  {canWrite && selectedAgent.status !== "retired" && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleToggleStatus} disabled={toggling}>
                        {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : selectedAgent.status === "active" ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Resume</>}
                      </Button>
                      <Link href={`/agents/${selectedAgent.id}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              {selectedWorkspace && (
                <div className="grid gap-3 grid-cols-3">
                  <div className="surface-card p-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{selectedWorkspace.openTasks}</div>
                    <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-quiet)" }}>Open Tasks</div>
                  </div>
                  <div className="surface-card p-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: selectedWorkspace.blockedTasks > 0 ? "var(--danger)" : "var(--text)" }}>{selectedWorkspace.blockedTasks}</div>
                    <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-quiet)" }}>Blocked</div>
                  </div>
                  <div className="surface-card p-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: "var(--success)" }}>{selectedWorkspace.completedTasks}</div>
                    <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-quiet)" }}>Completed</div>
                  </div>
                </div>
              )}

              {/* Workspace files */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
                  <FileText className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Workspace Files</span>
                </div>
                <div className="flex">
                  {/* File tabs */}
                  <div className="w-40 border-r p-2 space-y-0.5" style={{ borderColor: "var(--border)" }}>
                    {selectedFiles.map((file) => (
                      <button
                        key={file.name}
                        onClick={() => setActiveFile(file.name)}
                        className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                          activeFile === file.name ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium" : "hover:bg-[var(--surface-muted)] text-[var(--text-muted)]"
                        }`}
                      >
                        <span>{file.icon}</span>
                        <span>{file.label}</span>
                      </button>
                    ))}
                  </div>
                  {/* File content */}
                  <div className="flex-1 p-4 min-h-[200px] overflow-y-auto">
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap font-[var(--font-mono)]" style={{ color: "var(--text-muted)" }}>
                      {selectedFiles.find((f) => f.name === activeFile)?.content || "No content"}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Recent tasks */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Recent Tasks</span>
                  <Link href={`/agents/${selectedAgent.id}`} className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
                    View all →
                  </Link>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {tasks.filter((t) => t.assigned_agent_id === selectedAgent.id && t.status !== "done").slice(0, 5).map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`h-2 w-2 rounded-full ${task.status === "blocked" ? "dot-red" : task.status === "in-progress" ? "dot-blue" : "dot-gray"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{task.status}</Badge>
                    </div>
                  ))}
                  {tasks.filter((t) => t.assigned_agent_id === selectedAgent.id && t.status !== "done").length === 0 && (
                    <div className="py-6 text-center text-sm" style={{ color: "var(--text-quiet)" }}>No open tasks</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
