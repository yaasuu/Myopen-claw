"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { getAgentWorkspace } from "@/lib/data/workspace";
import { useRealtime } from "@/lib/realtime/use-realtime";
import type { Agent, AgentWorkspace } from "@/types/dashboard";
import { Brain, FileText, Zap, Heart, ChevronDown, ChevronUp } from "lucide-react";

const FILE_TABS = [
  { key: "memory", label: "Memory", icon: Brain,    color: "var(--accent)" },
  { key: "soul",   label: "Soul",   icon: Heart,    color: "var(--success)" },
  { key: "skills", label: "Skills", icon: Zap,      color: "var(--warning)" },
] as const;

type FileKey = typeof FILE_TABS[number]["key"];

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="space-y-1">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return <p key={i} className="text-xs font-bold mt-3 mb-1" style={{ color: "var(--text)" }}>{line.slice(3)}</p>;
        if (line.startsWith("# "))
          return <p key={i} className="text-sm font-bold mb-2" style={{ color: "var(--text)" }}>{line.slice(2)}</p>;
        if (line.startsWith("- "))
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: "var(--text-quiet)" }} />
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{line.slice(2)}</p>
            </div>
          );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{line}</p>;
      })}
    </div>
  );
}

function AgentMemoryCard({ workspace }: { workspace: AgentWorkspace }) {
  const [activeTab, setActiveTab] = useState<FileKey>("memory");
  const [expanded, setExpanded] = useState(false);

  const content = workspace[activeTab] as string;
  const lines = content.split("\n");
  const preview = lines.slice(0, 6).join("\n");
  const hasMore = lines.length > 6;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{workspace.agent.emoji}</span>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {workspace.agent.name}
            </CardTitle>
            <p className="text-[10px] truncate" style={{ color: "var(--text-quiet)" }}>{workspace.agent.domain}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]" style={{ color: workspace.agent.status === "active" ? "var(--success)" : "var(--text-quiet)" }}>
              {workspace.agent.status}
            </Badge>
            <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
              {workspace.openTasks} open · {workspace.completedTasks} done
            </span>
          </div>
        </div>

        {/* File tabs */}
        <div className="flex gap-1 mt-2">
          {FILE_TABS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setExpanded(false); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: activeTab === key ? `${color}14` : "transparent",
                color: activeTab === key ? color : "var(--text-quiet)",
              }}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <div
          className="rounded-lg p-3 font-mono text-[11px] overflow-hidden transition-all"
          style={{ background: "var(--surface-muted)", maxHeight: expanded ? "none" : undefined }}
        >
          <MarkdownBlock content={expanded || !hasMore ? content : preview} />
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-[11px] transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Show less" : `+${lines.length - 6} more lines`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export default function MemoryPage() {
  const [workspaces, setWorkspaces] = useState<AgentWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [agentsResult, tasksResult] = await Promise.all([getAgents(), getTasks({ includeArchived: false })]);
    const ws = agentsResult.data.map((agent) => getAgentWorkspace(agent, tasksResult.data));
    setWorkspaces(ws);
    setLoading(false);
  }, []);

  useRealtime("agents", load);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Memory Browser</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Agent soul, memory, and skill files
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-quiet)" }}>
          <Brain className="h-4 w-4" />
          {workspaces.length} agent{workspaces.length !== 1 ? "s" : ""}
        </div>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-quiet)" }}>Loading memory files…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {workspaces.map((ws) => (
            <AgentMemoryCard key={ws.agent.id} workspace={ws} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
