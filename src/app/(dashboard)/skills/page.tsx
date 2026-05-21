"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSkills, getAgentSkills } from "@/lib/data/skills";
import { getAgents } from "@/lib/data/agents";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { Skill, AgentSkill, Agent } from "@/types/dashboard";
import { Cpu, Users, Tag, Clock } from "lucide-react";

const categoryColors: Record<string, { bg: string; color: string }> = {
  communication: { bg: "rgba(99,102,241,0.08)",   color: "var(--accent)" },
  analysis:      { bg: "rgba(59,130,246,0.08)",   color: "var(--info)" },
  automation:    { bg: "rgba(16,185,129,0.08)",   color: "var(--success)" },
  writing:       { bg: "rgba(245,158,11,0.08)",   color: "var(--warning)" },
  research:      { bg: "rgba(139,92,246,0.08)",   color: "#8b5cf6" },
  operations:    { bg: "rgba(14,165,233,0.08)",   color: "#0ea5e9" },
};

function categoryStyle(cat: string) {
  return categoryColors[cat?.toLowerCase()] ?? { bg: "rgba(148,163,184,0.08)", color: "var(--text-muted)" };
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const load = useCallback(async () => {
    const [skillsResult, agentSkillsResult, agentsResult] = await Promise.all([
      getSkills(),
      getAgentSkills(),
      getAgents(),
    ]);
    setSkills(skillsResult.data);
    setAgentSkills(agentSkillsResult.data);
    setAgents(agentsResult.data);
    setLoading(false);
  }, []);

  useRealtime("agent_skills", load);

  useEffect(() => {
    load();
  }, [load]);

  const categories = ["all", ...Array.from(new Set(skills.map((s) => s.category).filter(Boolean)))];

  const filtered = filterCategory === "all" ? skills : skills.filter((s) => s.category === filterCategory);

  const agentsForSkill = (skillId: string) =>
    agentSkills
      .filter((as) => as.skill_id === skillId)
      .map((as) => {
        const agent = agents.find((a) => a.id === as.agent_id);
        return agent ?? { id: as.agent_id, name: as.agent_name ?? as.agent_id, emoji: as.agent_emoji ?? "🤖" };
      });

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>Skills Browser</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            All installed agent capabilities
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-quiet)" }}>
          <Cpu className="h-4 w-4" />
          {skills.length} skills · {agents.length} agents
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize"
            style={
              filterCategory === cat
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--surface-muted)", color: "var(--text-muted)" }
            }
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-quiet)" }}>Loading skills…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm" style={{ color: "var(--text-quiet)" }}>
            No skills found
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => {
            const cs = categoryStyle(skill.category);
            const holders = agentsForSkill(skill.id);
            return (
              <Card key={skill.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>
                      {skill.name}
                    </CardTitle>
                    <span
                      className="shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 capitalize"
                      style={{ background: cs.bg, color: cs.color }}
                    >
                      {skill.category}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {skill.description && (
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {skill.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-quiet)" }}>
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" /> {skill.source}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgo(skill.installed_at)}
                    </span>
                  </div>
                  {holders.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Users className="h-3 w-3 shrink-0" style={{ color: "var(--text-quiet)" }} />
                      {holders.map((a) => (
                        <span
                          key={a.id}
                          className="text-[10px] rounded-full px-1.5 py-0.5"
                          style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
                        >
                          {(a as Agent).emoji ?? "🤖"} {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
