"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Building2,
  Zap,
  Pause,
  Play,
  Pencil,
  FileText,
  Users,
  ChevronRight,
  Clock,
  Activity,
  AlertOctagon,
  CheckCircle2,
} from "lucide-react";
import { getAgents, updateAgentStatus } from "@/lib/data/agents";
import { getDepartments } from "@/lib/data/departments";
import { getSpecialists } from "@/lib/data/departments";
import { getTasks } from "@/lib/data/tasks";
import { getAgentWorkspace } from "@/lib/data/workspace";
import {
  getWorkspaceFiles,
  getOrCreateFile,
  updateFile,
  FILE_REGISTRY,
} from "@/lib/data/workspace-files";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { RelatedContext } from "@/components/ui/related-context";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { Agent, TaskWithAgent, Department, Specialist, AgentWorkspace, WorkspaceFile } from "@/types/dashboard";

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

type UnitType = "orchestrator" | "department" | "agent" | "specialist";

interface HierarchyItem {
  id: string;
  type: UnitType;
  name: string;
  emoji: string;
  status: string;
  meta: string;
  parentId?: string;
}

const FILTERS = ["all", "departments", "agents", "specialists"] as const;

export default function WorkforcePage() {
  const canWrite = useCanWrite();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);

  const [filter, setFilter] = useState<string>(searchParams.get("view") ?? "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<UnitType | null>(null);
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [fileRegistry, setFileRegistry] = useState<Array<{ name: string; label: string; icon: string }>>([]);
  const [activeFile, setActiveFile] = useState("SOUL.md");
  const [fileContent, setFileContent] = useState("");
  const [editingFile, setEditingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [agentsR, deptsR, specsR, tasksR] = await Promise.all([
        getAgents(),
        getDepartments(),
        getSpecialists(),
        getTasks(),
      ]);
      setAgents(agentsR.data);
      setDepartments(deptsR.data);
      setSpecialists(specsR.data);
      setTasks(tasksR.data);
      if (agentsR.error) setError(agentsR.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["agents", "departments", "specialists", "tasks"], loadRef);

  useEffect(() => { load(); }, []);

  // Agents that sit directly under Yas Claw (not under a department)
  const DIRECT_AGENTS = ["research-agent", "executive-finance", "qa-agent"];

  // Explicit agent-to-department mapping (avoids fragile domain keyword matching)
  const AGENT_DEPT_MAP: Record<string, string> = {
    "export-growth": "export-growth",
    "ops-improvement": "ops-improvement",
    "architecture-systems": "architecture-systems",
    "ui-ux-designer": "architecture-systems",
    "data-analyst": "ops-improvement",
  };

  function getAgentDeptId(agentShortId: string): string | undefined {
    const deptSlug = AGENT_DEPT_MAP[agentShortId];
    if (!deptSlug) return undefined;
    return departments.find((d) => d.slug === deptSlug || d.short_id === deptSlug)?.id;
  }

  // Build hierarchy
  const hierarchy: HierarchyItem[] = [
    { id: "yas-claw", type: "orchestrator", name: "Yas Claw", emoji: "🦀", status: "active", meta: "Orchestrator" },
    // Direct agents go under Yas Claw
    ...agents.filter((a) => DIRECT_AGENTS.includes(a.short_id)).map((a) => ({
      id: a.id,
      type: "agent" as UnitType,
      name: a.name,
      emoji: a.emoji,
      status: a.status,
      meta: `${tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length} tasks`,
      parentId: "yas-claw",
    })),
    // Departments
    ...departments.map((d) => ({
      id: d.id,
      type: "department" as UnitType,
      name: d.name,
      emoji: d.emoji,
      status: d.status,
      meta: `${agents.filter((a) => !DIRECT_AGENTS.includes(a.short_id) && getAgentDeptId(a.short_id) === d.id).length} agents`,
    })),
    // Agents (excluding direct agents)
    ...agents.filter((a) => !DIRECT_AGENTS.includes(a.short_id)).map((a) => ({
      id: a.id,
      type: "agent" as UnitType,
      name: a.name,
      emoji: a.emoji,
      status: a.status,
      meta: `${tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length} tasks`,
      parentId: getAgentDeptId(a.short_id),
    })),
    ...specialists.map((s) => ({
      id: s.id,
      type: "specialist" as UnitType,
      name: s.name,
      emoji: "⚡",
      status: s.status,
      meta: s.type,
    })),
  ];

  const filtered = hierarchy.filter((item) => {
    if (filter === "all") return true;
    if (filter === "departments") return item.type === "department";
    if (filter === "agents") return item.type === "agent" || item.type === "orchestrator";
    if (filter === "specialists") return item.type === "specialist";
    return true;
  });

  function selectItem(item: HierarchyItem) {
    setSelectedId(item.id);
    setSelectedType(item.type);
    setActiveFile("SOUL.md");
    setEditingFile(false);
    setWorkspaceFiles([]); // Clear files from previous selection
    setFileContent(""); // Clear content from previous selection

    const registry = FILE_REGISTRY[item.type] ?? FILE_REGISTRY.agent;
    setFileRegistry(registry);

    if (item.type === "orchestrator") {
      // Orchestrator has no agent record — use virtual workspace
      setWorkspace(null);
      loadFile("orchestrator", "yas-claw-orchestrator", registry[0]?.name ?? "IDENTITY.md", "Yas Claw");
    } else if (item.type === "agent") {
      const agent = agents.find((a) => a.id === item.id);
      if (agent) {
        const ws = getAgentWorkspace(agent, tasks);
        setWorkspace(ws);
        loadFile("agent", item.id, registry[0]?.name ?? "SOUL.md", agent.name);
      }
    } else if (item.type === "department") {
      const dept = departments.find((d) => d.id === item.id);
      setWorkspace(null);
      if (dept) loadFile(item.type, item.id, registry[0]?.name ?? "SOUL.md", dept.name);
    } else if (item.type === "specialist") {
      const spec = specialists.find((s) => s.id === item.id);
      setWorkspace(null);
      if (spec) loadFile(item.type, item.id, registry[0]?.name ?? "MISSION.md", spec.name);
    } else {
      setWorkspace(null);
    }
  }

  async function loadFile(unitType: string, unitId: string, fileName: string, unitName: string) {
    const result = await getOrCreateFile(unitType as any, unitId, fileName, unitName);
    if (result.data) {
      setWorkspaceFiles(prev => {
        const exists = prev.find(f => f.file_name === fileName);
        if (exists) return prev.map(f => f.file_name === fileName ? result.data! : f);
        return [...prev, result.data!];
      });
      setFileContent(result.data.file_content);
    }
  }

  async function switchFile(fileName: string) {
    if (!selectedId || !selectedType) return;
    const item = hierarchy.find(h => h.id === selectedId);
    const unitName = item?.name ?? "Unit";
    setActiveFile(fileName);
    setEditingFile(false);

    // Check if already loaded
    const existing = workspaceFiles.find(f => f.file_name === fileName);
    if (existing) {
      setFileContent(existing.file_content);
    } else {
      await loadFile(selectedType, selectedId, fileName, unitName);
    }
  }

  async function handleSaveFile() {
    const file = workspaceFiles.find(f => f.file_name === activeFile);
    if (!file) return;
    setSavingFile(true);
    const result = await updateFile(file.id, fileContent);
    if (result.data) {
      setWorkspaceFiles(prev => prev.map(f => f.id === result.data!.id ? result.data! : f));
    }
    setEditingFile(false);
    setSavingFile(false);
  }

  const selectedAgent = selectedType === "agent"
    ? agents.find((a) => a.id === selectedId) ?? null
    : null;
  const selectedOrchestrator = selectedType === "orchestrator";
  const selectedDept = selectedType === "department"
    ? departments.find((d) => d.id === selectedId) ?? null
    : null;
  const selectedSpec = selectedType === "specialist"
    ? specialists.find((s) => s.id === selectedId) ?? null
    : null;

  const activeCount = agents.filter((a) => a.status === "active").length;
  const pausedCount = agents.filter((a) => a.status === "paused").length;
  const overloadedCount = agents.filter((a) => tasks.filter((t) => t.assigned_agent_id === a.id && t.status !== "done").length >= 5).length;

  if (loading) {
    return (
      <PageShell title="Workforce" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading workforce...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Workforce" description="Organization hierarchy and unit workspaces">
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>{error}</div>
      )}

      {/* Runtime debug strip */}
      <div className="font-mono text-[10px] flex gap-3 flex-wrap">
        <span>SUPABASE_URL: <strong>{process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "⚠️ UNDEFINED"}</strong></span>
        <span>agents count: <strong>{agents.length}</strong></span>
        <span>depts count: <strong>{departments.length}</strong></span>
      </div>

      {/* Top metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total Agents", value: String(agents.length), color: "var(--text)" },
          { label: "Active", value: String(activeCount), color: "var(--success)" },
          { label: "Paused", value: String(pausedCount), color: pausedCount > 0 ? "var(--warning)" : "var(--text-quiet)" },
          { label: "Departments", value: String(departments.length), color: "var(--accent)" },
          { label: "Specialists", value: String(specialists.length), color: "var(--info)" },
          { label: "Overloaded", value: String(overloadedCount), color: overloadedCount > 0 ? "var(--danger)" : "var(--text-quiet)" },
        ].map((m) => (
          <div key={m.label} className="surface-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{m.label}</p>
            <p className="text-xl font-bold mt-1" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize"
            style={{
              background: filter === f ? "var(--text)" : "transparent",
              color: filter === f ? "var(--surface)" : "var(--text-muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Split layout */}
      <div className="flex gap-4" style={{ minHeight: "500px" }}>
        {/* Left: Hierarchy */}
        <div className="w-[260px] shrink-0 rounded-xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Hierarchy</p>
          </div>
          <div className="p-2 space-y-0.5 overflow-y-auto" style={{ maxHeight: "500px" }}>
            {filtered.map((item) => {
              const isSelected = selectedId === item.id;
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => selectItem(item)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-muted)]"
                  }`}
                  style={{ paddingLeft: item.parentId ? "2.5rem" : "0.75rem" }}
                >
                  <div className="relative">
                    <span className="text-base">{item.emoji}</span>
                    <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border ${item.status === "active" ? "dot-green" : item.status === "paused" ? "dot-amber" : "dot-gray"}`} style={{ borderColor: "var(--surface)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: isSelected ? "var(--accent)" : "var(--text)" }}>{item.name}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-quiet)" }}>{item.meta}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{item.type}</Badge>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Workspace */}
        <div className="flex-1">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }}>
              <div className="text-center">
                <Users className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--text-quiet)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Select a unit</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>Choose from the hierarchy to view workspace</p>
              </div>
            </div>
          ) : selectedOrchestrator ? (
            // Orchestrator workspace
            <div className="space-y-4">
              <div className="surface-card p-5">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">🦀</span>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Yas Claw</h2>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>Central AI Orchestrator — Coordinates all departments and agents</p>
                    <Badge variant="outline" className="mt-1 text-xs">Active</Badge>
                  </div>
                </div>
                <p className="text-sm mt-3" style={{ color: "var(--text-quiet)" }}>
                  Top-level orchestrator. Receives work from Yas, classifies it, routes to domain agents, monitors execution, approves completions.
                </p>
              </div>

              {/* Orchestrator workspace files */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Workspace Files</span>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditingFile(!editingFile)}>
                      {editingFile ? "Cancel" : "Edit"}
                    </Button>
                  )}
                </div>
                <div className="flex">
                  <div className="w-40 border-r p-2 space-y-0.5" style={{ borderColor: "var(--border)" }}>
                    {fileRegistry.map((reg) => (
                      <button key={reg.name} onClick={() => switchFile(reg.name)} className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${activeFile === reg.name ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium" : "hover:bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}>
                        <span>{reg.icon}</span><span className="truncate">{reg.label}</span>
                        {!workspaceFiles.some(f => f.file_name === reg.name) && <span className="text-[9px] ml-auto" style={{ color: "var(--text-quiet)" }}>+</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 p-4 min-h-[200px] overflow-y-auto">
                    {editingFile ? (
                      <div className="space-y-3">
                        <textarea className="w-full min-h-[160px] rounded-lg border p-3 text-sm resize-y" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }} value={fileContent} onChange={(e) => setFileContent(e.target.value)} />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setEditingFile(false); const f = workspaceFiles.find(w => w.file_name === activeFile); if (f) setFileContent(f.file_content); }}>Cancel</Button>
                          <Button size="sm" onClick={handleSaveFile} disabled={savingFile}>{savingFile ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save</Button>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fileContent || "No content yet. Click Edit to add content."}</pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : selectedAgent && workspace ? (
            // Agent workspace
            <div className="space-y-4">
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
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
                        const newStatus = selectedAgent.status === "active" ? "paused" : "active";
                        setToggling(true);
                        const result = await updateAgentStatus(selectedAgent.id, newStatus);
                        if (result.data) {
                          setAgents((prev) => prev.map((a) => a.id === result.data!.id ? result.data! : a));
                        }
                        setToggling(false);
                      }} disabled={toggling}>
                        {toggling ? <Loader2 className="h-3 w-3 animate-spin" /> : selectedAgent.status === "active" ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Resume</>}
                      </Button>
                      <Link href={`/agents/${selectedAgent.id}`}>
                        <Button variant="outline" size="sm" className="gap-1.5"><Pencil className="h-3 w-3" /> Edit</Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 grid-cols-3">
                <div className="surface-card p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{workspace.openTasks}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-quiet)" }}>Open</div>
                </div>
                <div className="surface-card p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: workspace.blockedTasks > 0 ? "var(--danger)" : "var(--text)" }}>{workspace.blockedTasks}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-quiet)" }}>Blocked</div>
                </div>
                <div className="surface-card p-4 text-center">
                  <div className="text-2xl font-bold" style={{ color: "var(--success)" }}>{workspace.completedTasks}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-quiet)" }}>Done</div>
                </div>
              </div>

              {/* Workspace files */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Workspace Files</span>
                  </div>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        if (editingFile) {
                          setEditingFile(false);
                          const file = workspaceFiles.find(f => f.file_name === activeFile);
                          if (file) setFileContent(file.file_content);
                        } else {
                          setEditingFile(true);
                        }
                      }}
                    >
                      {editingFile ? "Cancel" : "Edit"}
                    </Button>
                  )}
                </div>
                <div className="flex">
                  {/* File tabs */}
                  <div className="w-40 border-r p-2 space-y-0.5" style={{ borderColor: "var(--border)" }}>
                    {fileRegistry.map((reg) => {
                      const exists = workspaceFiles.some(f => f.file_name === reg.name);
                      return (
                        <button
                          key={reg.name}
                          onClick={() => switchFile(reg.name)}
                          className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                            activeFile === reg.name ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium" : "hover:bg-[var(--surface-muted)] text-[var(--text-muted)]"
                          }`}
                        >
                          <span>{reg.icon}</span>
                          <span className="truncate">{reg.label}</span>
                          {!exists && <span className="text-[9px] ml-auto" style={{ color: "var(--text-quiet)" }}>+</span>}
                        </button>
                      );
                    })}
                  </div>
                  {/* File content */}
                  <div className="flex-1 p-4 min-h-[200px] overflow-y-auto">
                    {editingFile ? (
                      <div className="space-y-3">
                        <textarea
                          className="w-full min-h-[200px] rounded-lg border p-3 text-sm leading-relaxed resize-y"
                          style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }}
                          value={fileContent}
                          onChange={(e) => setFileContent(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            setEditingFile(false);
                            const file = workspaceFiles.find(f => f.file_name === activeFile);
                            if (file) setFileContent(file.file_content);
                          }}>Cancel</Button>
                          <Button size="sm" onClick={handleSaveFile} disabled={savingFile}>
                            {savingFile ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {fileContent || "No content yet. Click Edit to add content."}
                      </pre>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent tasks */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Open Tasks</span>
                  <Link href={`/agents/${selectedAgent.id}`} className="text-xs hover:underline" style={{ color: "var(--accent)" }}>View all →</Link>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {tasks.filter((t) => t.assigned_agent_id === selectedAgent.id && t.status !== "done").slice(0, 5).map((task) => (
                    <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`h-2 w-2 rounded-full ${task.status === "blocked" ? "dot-red" : task.status === "in-progress" ? "dot-blue" : "dot-gray"}`} />
                      <p className="text-sm flex-1 truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">{task.status}</Badge>
                    </div>
                  ))}
                  {tasks.filter((t) => t.assigned_agent_id === selectedAgent.id && t.status !== "done").length === 0 && (
                    <div className="py-6 text-center text-sm" style={{ color: "var(--text-quiet)" }}>No open tasks</div>
                  )}
                </div>
              </div>
            </div>
          ) : selectedDept ? (
            // Department workspace
            <div className="space-y-4">
              <div className="surface-card p-5">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{selectedDept.emoji}</span>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{selectedDept.name}</h2>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>{selectedDept.mandate}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`h-2 w-2 rounded-full ${selectedDept.status === "active" ? "dot-green" : "dot-amber"}`} />
                      <Badge variant="outline" className="text-xs">{selectedDept.status}</Badge>
                      <Badge variant="outline" className="text-xs">{selectedDept.priority} priority</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Department agents */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Agents</span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {agents.filter((a) => getAgentDeptId(a.short_id) === selectedDept.id).map((agent) => (
                    <button key={agent.id} onClick={() => selectItem({ id: agent.id, type: "agent", name: agent.name, emoji: agent.emoji, status: agent.status, meta: "" })} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-muted)] transition-colors text-left">
                      <span className="text-lg">{agent.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{agent.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{agent.domain}</p>
                      </div>
                      <div className={`h-2 w-2 rounded-full ${agent.status === "active" ? "dot-green" : agent.status === "paused" ? "dot-amber" : "dot-gray"}`} />
                    </button>
                  ))}
                  {agents.filter((a) => getAgentDeptId(a.short_id) === selectedDept.id).length === 0 && (
                    <div className="py-6 text-center text-sm" style={{ color: "var(--text-quiet)" }}>No agents assigned</div>
                  )}
                </div>
              </div>

              {/* Department related context */}
              <div className="surface-card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-quiet)" }}>Related Context</p>
                <RelatedContext
                  tasks={tasks.filter((t) => {
                    const deptAgents = agents.filter((a) => getAgentDeptId(a.short_id) === selectedDept.id);
                    return deptAgents.some((a) => a.id === t.assigned_agent_id) && t.status !== "done";
                  })}
                  lastActivity={selectedDept.created_at}
                  viewAllHref="/tasks"
                />
              </div>

              {/* Department workspace files */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Workspace Files</span>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditingFile(!editingFile)}>
                      {editingFile ? "Cancel" : "Edit"}
                    </Button>
                  )}
                </div>
                <div className="flex">
                  <div className="w-40 border-r p-2 space-y-0.5" style={{ borderColor: "var(--border)" }}>
                    {fileRegistry.map((reg) => (
                      <button key={reg.name} onClick={() => switchFile(reg.name)} className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${activeFile === reg.name ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium" : "hover:bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}>
                        <span>{reg.icon}</span><span className="truncate">{reg.label}</span>
                        {!workspaceFiles.some(f => f.file_name === reg.name) && <span className="text-[9px] ml-auto" style={{ color: "var(--text-quiet)" }}>+</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 p-4 min-h-[150px] overflow-y-auto">
                    {editingFile ? (
                      <div className="space-y-3">
                        <textarea className="w-full min-h-[120px] rounded-lg border p-3 text-sm resize-y" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }} value={fileContent} onChange={(e) => setFileContent(e.target.value)} />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setEditingFile(false); const f = workspaceFiles.find(w => w.file_name === activeFile); if (f) setFileContent(f.file_content); }}>Cancel</Button>
                          <Button size="sm" onClick={handleSaveFile} disabled={savingFile}>{savingFile ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save</Button>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fileContent || "No content yet. Click Edit to add content."}</pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : selectedSpec ? (
            // Specialist workspace
            <div className="space-y-4">
              <div className="surface-card p-5">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">⚡</span>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{selectedSpec.name}</h2>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>{selectedSpec.type}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{selectedSpec.status}</Badge>
                  </div>
                </div>
                <p className="text-sm mt-4" style={{ color: "var(--text-muted)" }}>{selectedSpec.mission}</p>
                {selectedSpec.output_summary && (
                  <div className="mt-3 rounded-lg p-3" style={{ background: "var(--surface-muted)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--text-quiet)" }}>Output</p>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>{selectedSpec.output_summary}</p>
                  </div>
                )}
              </div>

              {/* Specialist workspace files */}
              <div className="surface-card">
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Workspace Files</span>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditingFile(!editingFile)}>
                      {editingFile ? "Cancel" : "Edit"}
                    </Button>
                  )}
                </div>
                <div className="flex">
                  <div className="w-40 border-r p-2 space-y-0.5" style={{ borderColor: "var(--border)" }}>
                    {fileRegistry.map((reg) => (
                      <button key={reg.name} onClick={() => switchFile(reg.name)} className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${activeFile === reg.name ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium" : "hover:bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}>
                        <span>{reg.icon}</span><span className="truncate">{reg.label}</span>
                        {!workspaceFiles.some(f => f.file_name === reg.name) && <span className="text-[9px] ml-auto" style={{ color: "var(--text-quiet)" }}>+</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 p-4 min-h-[150px] overflow-y-auto">
                    {editingFile ? (
                      <div className="space-y-3">
                        <textarea className="w-full min-h-[120px] rounded-lg border p-3 text-sm resize-y" style={{ background: "var(--surface-muted)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }} value={fileContent} onChange={(e) => setFileContent(e.target.value)} />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setEditingFile(false); const f = workspaceFiles.find(w => w.file_name === activeFile); if (f) setFileContent(f.file_content); }}>Cancel</Button>
                          <Button size="sm" onClick={handleSaveFile} disabled={savingFile}>{savingFile ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save</Button>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fileContent || "No content yet. Click Edit to add content."}</pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
