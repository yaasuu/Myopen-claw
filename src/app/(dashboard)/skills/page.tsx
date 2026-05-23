"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSkills, getAgentSkills } from "@/lib/data/skills";
import { getAgents } from "@/lib/data/agents";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";
import type { Skill, AgentSkill, Agent } from "@/types/dashboard";
import {
  Sparkles, Users, Tag, Clock, Search, Brain,
  Cpu, MessageSquare, BarChart3, Bot, FileText, Settings as SettingsIcon,
  Globe, Activity, Loader2,
} from "lucide-react";

interface HermesSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: string[];
  category: string;
  downloads: number;
  stars: number;
  version: string | null;
}

// ─── Hermes brand: source label rewrite ───────────────
// We keep "clawhub" / "hermes" as the underlying DB value
// (a future migration will normalize to "hermes") and just
// render it as "Hermes" everywhere in the UI.
function formatSource(source: string | undefined | null): string {
  if (!source) return "Manual";
  const s = source.toLowerCase();
  if (s === "clawhub" || s === "hermes") return "Hermes";
  return source[0].toUpperCase() + source.slice(1);
}

// ─── Category icons + colors ───────────────────────────
const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  communication: { icon: MessageSquare, color: "var(--accent)",  bg: "var(--accent-soft)" },
  analysis:      { icon: BarChart3,     color: "var(--info)",    bg: "rgba(37,99,235,0.08)" },
  automation:    { icon: Bot,           color: "var(--success)", bg: "rgba(16,185,129,0.08)" },
  writing:       { icon: FileText,      color: "var(--warning)", bg: "rgba(245,158,11,0.08)" },
  research:      { icon: Brain,         color: "#8b5cf6",        bg: "rgba(139,92,246,0.08)" },
  operations:    { icon: SettingsIcon,  color: "#0ea5e9",        bg: "rgba(14,165,233,0.08)" },
  development:   { icon: Cpu,           color: "var(--text)",    bg: "var(--surface-muted)" },
  utility:       { icon: Activity,      color: "var(--text-muted)", bg: "var(--surface-muted)" },
};

function categoryStyle(cat: string) {
  return CATEGORY_CONFIG[cat?.toLowerCase()] ?? { icon: Tag, color: "var(--text-muted)", bg: "var(--surface-muted)" };
}

export default function SkillsPage() {
  const [skills, setSkills]           = useState<Skill[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQ, setSearchQ]         = useState("");
  const [hermesSkills, setHermesSkills] = useState<HermesSkill[]>([]);
  const [hermesLoading, setHermesLoading] = useState(true);
  const [hermesError, setHermesError] = useState<string | null>(null);

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

    // Fetch Hermes registry skills
    try {
      const hermesRes = await fetch("/api/hermes-skills");
      const hermesData = await hermesRes.json();
      setHermesSkills(hermesData.items ?? []);
    } catch {
      setHermesError("Could not reach Hermes registry");
    } finally {
      setHermesLoading(false);
    }
  }, []);

  useRealtime("agent_skills", load);
  useEffect(() => { load(); }, [load]);

  // ── Derived ────────────────────────────────────────
  const filtered = useMemo(() => {
    let out = skills;
    if (filterCategory !== "all") out = out.filter((s) => s.category === filterCategory);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      out = out.filter((s) =>
        s.name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q)
      );
    }
    return out;
  }, [skills, filterCategory, searchQ]);

  // Cross-reference: which Hermes skills are already installed in our DB
  const installedSlugs = useMemo(
    () => new Set(skills.map((s) => s.name.toLowerCase())),
    [skills]
  );

  const filteredHermes = useMemo(() => {
    let out = hermesSkills;
    if (filterCategory !== "all") out = out.filter((s) => s.category === filterCategory);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      out = out.filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return out;
  }, [hermesSkills, filterCategory, searchQ]);

  // Combined categories from both sources
  const allCategories = useMemo(
    () => ["all", ...Array.from(new Set([
      ...skills.map((s) => s.category).filter(Boolean),
      ...hermesSkills.map((s) => s.category).filter(Boolean),
    ]))],
    [skills, hermesSkills]
  );

  const agentsForSkill = (skillId: string) =>
    agentSkills
      .filter((as) => as.skill_id === skillId)
      .map((as) => {
        const agent = agents.find((a) => a.id === as.agent_id);
        return agent ?? { id: as.agent_id, name: as.agent_name ?? as.agent_id, emoji: as.agent_emoji ?? "🤖" };
      });

  // Stats
  const totalSkills    = skills.length;
  const totalInstalls  = agentSkills.length;
  const totalCategories = new Set(skills.map((s) => s.category).filter(Boolean)).size;

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading skill library…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
            <Sparkles className="h-6 w-6" style={{ color: "#8b5cf6" }} />
            Hermes Skill Library
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Capabilities your agents can install · powered by Hermes
          </p>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Skills",     val: totalSkills,           sub: "installed",         icon: Sparkles, color: "#8b5cf6",         bg: "rgba(139,92,246,0.08)" },
          { label: "Installs",   val: totalInstalls,         sub: "agent-skill links", icon: Users,    color: "var(--accent)",   bg: "var(--accent-soft)" },
          { label: "Categories", val: totalCategories,       sub: "skill domains",     icon: Tag,      color: "var(--info)",     bg: "rgba(37,99,235,0.08)" },
          { label: "Hermes",     val: hermesSkills.length,   sub: "from skill finder", icon: Globe,    color: "var(--success)",  bg: "rgba(16,185,129,0.08)" },
        ].map((c) => {
          const Icon = c.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
          return (
            <div key={c.label} className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>{c.label}</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: c.bg }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                </div>
              </div>
              <div className="text-3xl font-black tabular-nums" style={{ color: c.color }}>{c.val}</div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quiet)" }}>{c.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Search + category filter ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="rounded-xl border flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px]" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-quiet)" }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-quiet)]"
            placeholder="Search skills…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {allCategories.map((cat) => {
            const active = filterCategory === cat;
            const style = cat === "all" ? null : categoryStyle(cat);
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
                style={
                  active
                    ? { background: style?.color ?? "var(--text)", color: "#fff" }
                    : { background: "var(--surface-muted)", color: "var(--text-muted)" }
                }
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Skill grid ── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border py-16 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <Sparkles className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {searchQ ? "No skills match your search" : "No skills installed yet"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
            {searchQ ? "Try a different keyword." : "Request a skill from Approvals to add capabilities."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => {
            const style = categoryStyle(skill.category);
            const Icon = style.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
            const holders = agentsForSkill(skill.id);

            return (
              <div
                key={skill.id}
                className="rounded-xl border p-4 transition-all hover:-translate-y-0.5"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: style.bg }}>
                      <Icon className="h-4 w-4" style={{ color: style.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{skill.name}</p>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: style.color }}
                      >
                        {skill.category || "uncategorized"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {skill.description && (
                  <p className="text-xs leading-relaxed mb-3 line-clamp-3" style={{ color: "var(--text-muted)" }}>
                    {skill.description}
                  </p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-3 text-[10px] mb-3 pb-3 border-b" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
                  <span className="flex items-center gap-1">
                    {formatSource(skill.source) === "Hermes"
                      ? <Sparkles className="h-3 w-3" style={{ color: "#8b5cf6" }} />
                      : <Tag className="h-3 w-3" />}
                    {formatSource(skill.source)}
                  </span>
                  {skill.installed_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgo(skill.installed_at)}
                    </span>
                  )}
                  {skill.status && (
                    <Badge variant="outline" className="text-[9px] capitalize ml-auto">{skill.status}</Badge>
                  )}
                </div>

                {/* Agents using this skill */}
                {holders.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Users className="h-3 w-3 shrink-0" style={{ color: "var(--text-quiet)" }} />
                    {holders.slice(0, 4).map((a) => (
                      <span
                        key={a.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                        style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
                      >
                        {(a as Agent).emoji ?? "🤖"} {a.name}
                      </span>
                    ))}
                    {holders.length > 4 && (
                      <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>+{holders.length - 4}</span>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] italic" style={{ color: "var(--text-quiet)" }}>Not installed on any agent yet</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Hermes Registry — available skills ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "#8b5cf6" }} />
          <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>
            Available from Hermes Registry
          </h2>
          {hermesLoading && <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--text-quiet)" }} />}
          {!hermesLoading && (
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
              {filteredHermes.filter((s) => !installedSlugs.has(s.slug.toLowerCase())).length} available
            </span>
          )}
        </div>

        {hermesError && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>{hermesError}</p>
        )}

        {!hermesLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredHermes
              .filter((s) => !installedSlugs.has(s.slug.toLowerCase()))
              .slice(0, 30)
              .map((skill) => {
                const cs = categoryStyle(skill.category);
                const Icon = cs.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                return (
                  <div
                    key={skill.slug}
                    className="rounded-xl border p-4 flex flex-col gap-2 hover:-translate-y-0.5 transition-all"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: cs.bg }}>
                        <Icon className="h-4 w-4" style={{ color: cs.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{skill.displayName}</p>
                        <p className="text-[10px] uppercase font-medium mt-0.5" style={{ color: cs.color }}>{skill.category}</p>
                      </div>
                    </div>
                    <p className="text-[11px] leading-snug line-clamp-2" style={{ color: "var(--text-muted)" }}>
                      {skill.summary}
                    </p>
                    <div className="flex items-center gap-3 mt-auto pt-1">
                      <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
                        ↓ {skill.downloads.toLocaleString()}
                      </span>
                      {skill.version && (
                        <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>v{skill.version}</span>
                      )}
                      {skill.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-muted)", color: "var(--text-quiet)" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t flex items-center justify-between flex-wrap gap-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
        <span>{filtered.length} of {skills.length} {skills.length !== 1 ? "skills" : "skill"} shown</span>
      </div>
    </PageShell>
  );
}
