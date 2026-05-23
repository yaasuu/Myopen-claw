"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, BookOpen, Search, FolderOpen, Layers, Archive,
  ArrowRight, X, Calendar,
} from "lucide-react";
import {
  getKnowledgeEntries,
  type KnowledgeEntry, type PARACategory,
} from "@/lib/data/knowledge";
import { useRealtime } from "@/lib/realtime/use-realtime";
import { timeAgo } from "@/lib/utils";

const PARA_CONFIG: { key: PARACategory; label: string; sub: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: "project",  label: "Projects",  sub: "in flight",  icon: FolderOpen, color: "var(--info)",       bg: "rgba(37,99,235,0.08)"  },
  { key: "area",     label: "Areas",     sub: "ongoing",    icon: Layers,     color: "var(--accent)",     bg: "var(--accent-soft)"    },
  { key: "resource", label: "Resources", sub: "reference",  icon: BookOpen,   color: "var(--success)",    bg: "rgba(16,185,129,0.08)" },
  { key: "archive",  label: "Archives",  sub: "stored",     icon: Archive,    color: "var(--text-quiet)", bg: "var(--surface-muted)"  },
];

export default function KnowledgePage() {
  const [entries, setEntries]     = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<PARACategory | "all">("all");
  const [search, setSearch]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getKnowledgeEntries({
      category: filter === "all" ? undefined : filter,
      search:   search || undefined,
    });
    setEntries(res.data ?? []);
    setLoading(false);
  }, [filter, search]);

  useRealtime("knowledge_entries", load);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filter === "all" ? entries : entries.filter((e) => e.category === filter),
    [entries, filter]
  );

  const totalByCat: Record<PARACategory, number> = useMemo(() => {
    const r: Record<PARACategory, number> = { project: 0, area: 0, resource: 0, archive: 0 };
    for (const e of entries) r[e.category] = (r[e.category] ?? 0) + 1;
    return r;
  }, [entries]);

  if (loading && entries.length === 0) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-20 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading knowledge base…
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
            <BookOpen className="h-6 w-6" style={{ color: "var(--info)" }} />
            Knowledge
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            PARA library — Projects · Areas · Resources · Archives
          </p>
        </div>
        <Link href="/learning" className="text-xs font-medium flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
          Learning <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ── Search ── */}
      <div className="rounded-xl border flex items-center gap-3 px-4 py-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-quiet)" }} />
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-quiet)]"
          placeholder="Search knowledge entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} className="rounded p-1 hover:bg-[var(--surface-muted)]">
            <X className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
          </button>
        )}
      </div>

      {/* ── PARA cards (4 prominent + clickable) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PARA_CONFIG.map((cat) => {
          const Icon = cat.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
          const isActive = filter === cat.key;
          const count = totalByCat[cat.key];
          return (
            <button
              key={cat.key}
              onClick={() => setFilter(isActive ? "all" : cat.key)}
              className="rounded-xl p-5 text-left transition-all hover:-translate-y-0.5"
              style={{
                background: isActive ? cat.bg : "var(--surface)",
                border: `1px solid ${isActive ? cat.color + "40" : "var(--border)"}`,
                boxShadow: isActive ? `0 0 0 2px ${cat.color}40` : "var(--shadow-card)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isActive ? cat.color : "var(--text-quiet)" }}>
                  {cat.label}
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: cat.bg }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                </div>
              </div>
              <div className="text-3xl font-black tabular-nums" style={{ color: isActive ? cat.color : "var(--text)" }}>{count}</div>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-quiet)" }}>{cat.sub}</p>
            </button>
          );
        })}
      </div>

      {/* ── Active filter chip ── */}
      {filter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Filtered by</span>
          <button
            onClick={() => setFilter("all")}
            className="rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5 capitalize"
            style={{ background: PARA_CONFIG.find((c) => c.key === filter)?.bg, color: PARA_CONFIG.find((c) => c.key === filter)?.color }}
          >
            {filter} <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ── Entries ── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border py-16 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <BookOpen className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {search ? "No entries match your search" : filter === "all" ? "No knowledge entries yet" : `No ${filter} entries yet`}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
            Knowledge accrues as agents document decisions, findings, and references.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => {
            const cat = PARA_CONFIG.find((c) => c.key === entry.category);
            return (
              <div key={entry.id} className="rounded-xl border p-4 transition-all hover:-translate-y-0.5" style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-card)",
              }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text)" }}>{entry.title}</p>
                  <Badge variant="outline" className="text-[10px] capitalize shrink-0" style={{ color: cat?.color }}>
                    {entry.category}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed line-clamp-3 mb-3" style={{ color: "var(--text-muted)" }}>{entry.content}</p>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {entry.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] pt-2 border-t" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {timeAgo(entry.updated_at)}
                  </span>
                  <span>{entry.source}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="pt-2 border-t flex items-center justify-between flex-wrap gap-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-quiet)" }}>
        <span>{filtered.length} of {entries.length} entries</span>
        <Link href="/learning" className="hover:underline" style={{ color: "var(--accent)" }}>
          Learning →
        </Link>
      </div>
    </PageShell>
  );
}
