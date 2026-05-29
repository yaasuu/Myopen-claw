"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Newspaper, Sparkles, RefreshCw, Loader2, Pin, ExternalLink, Bot,
  Cpu, BrainCircuit, Ship, Scale, DollarSign, ShieldCheck,
  Package, AlertTriangle, Zap, Inbox,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
interface NewsItem {
  id: string;
  category: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  published_at: string | null;
  is_pinned: boolean;
  is_read: boolean;
  created_at: string;
}

// ── Category metadata ──────────────────────────────────────────────────────────
type CatMeta = { key: string; label: string; icon: typeof Bot; rgb: string };

const CATEGORIES: CatMeta[] = [
  { key: "llm-models", label: "Free Models", icon: Sparkles,    rgb: "139,92,246" },
  { key: "hermes",     label: "Hermes",      icon: Bot,         rgb: "99,102,241" },
  { key: "ai",         label: "AI",          icon: BrainCircuit, rgb: "59,130,246" },
  { key: "technology", label: "Technology",  icon: Cpu,         rgb: "14,165,233" },
  { key: "export",     label: "Export",      icon: Package,     rgb: "16,185,129" },
  { key: "tariffs",    label: "Tariffs",     icon: Scale,       rgb: "245,158,11" },
  { key: "shipping",   label: "Shipping",    icon: Ship,        rgb: "20,184,166" },
  { key: "forex",      label: "Forex",       icon: DollarSign,  rgb: "234,179,8" },
  { key: "compliance", label: "Compliance",  icon: ShieldCheck, rgb: "236,72,153" },
];

const CAT_MAP = new Map(CATEGORIES.map((c) => [c.key, c]));
function meta(cat: string): CatMeta {
  return CAT_MAP.get(cat) ?? { key: cat, label: cat, icon: Newspaper, rgb: "120,120,130" };
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const [items, setItems]     = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeCat, setActiveCat] = useState<string>("all");
  const [view, setView] = useState<"all" | "unread" | "pinned">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news?category=all&limit=150");
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as NewsItem[];
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Optimistic PATCH (pin / read) ──────────────────────────────────────────
  const patch = useCallback(async (id: string, body: Partial<Pick<NewsItem, "is_pinned" | "is_read">>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...body } : it)));
    try {
      const res = await fetch(`/api/news?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      // revert on failure
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...invert(body) } : it)));
    }
  }, []);

  function invert(body: Partial<Pick<NewsItem, "is_pinned" | "is_read">>) {
    const out: Partial<NewsItem> = {};
    if (typeof body.is_pinned === "boolean") out.is_pinned = !body.is_pinned;
    if (typeof body.is_read === "boolean") out.is_read = !body.is_read;
    return out;
  }

  async function togglePin(e: React.MouseEvent, it: NewsItem) {
    e.preventDefault(); e.stopPropagation();
    setBusyId(it.id);
    await patch(it.id, { is_pinned: !it.is_pinned });
    setBusyId(null);
  }

  function openItem(it: NewsItem) {
    if (!it.is_read) patch(it.id, { is_read: true });
    window.open(it.url, "_blank", "noopener,noreferrer");
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [items]);

  const unreadCount = useMemo(() => items.filter((i) => !i.is_read).length, [items]);
  const pinnedCount = useMemo(() => items.filter((i) => i.is_pinned).length, [items]);

  const freeModels = useMemo(
    () => items.filter((i) => i.category === "llm-models").slice(0, 6),
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (activeCat !== "all" && it.category !== activeCat) return false;
      if (view === "unread" && it.is_read) return false;
      if (view === "pinned" && !it.is_pinned) return false;
      return true;
    });
  }, [items, activeCat, view]);

  // Sort: pinned first, then newest
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      const at = new Date(a.published_at ?? a.created_at).getTime();
      const bt = new Date(b.published_at ?? b.created_at).getTime();
      return bt - at;
    });
  }, [filtered]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-2 py-24 justify-center text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading news…
        </div>
      </PageShell>
    );
  }

  if (error && items.length === 0) {
    return (
      <PageShell>
        <div className="rounded-xl border p-5 flex items-center gap-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <AlertTriangle className="h-5 w-5" style={{ color: "var(--danger)" }} />
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Couldn&apos;t load the news feed</p>
            <p className="text-xs" style={{ color: "var(--text-quiet)" }}>{error}</p>
          </div>
          <button onClick={() => load()} className="text-sm hover:underline flex items-center gap-1" style={{ color: "var(--accent)" }}>
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0"
               style={{ background: "var(--accent-soft)" }}>
            <Newspaper className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--text)" }}>News</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
              Free models, AI, export &amp; trade — refreshed daily from real sources
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {unreadCount} unread
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>
          Some data may be stale: {error}
        </div>
      )}

      {/* ── Free Models spotlight ── */}
      {activeCat === "all" && view === "all" && freeModels.length > 0 && (
        <div className="rounded-2xl border p-5 relative overflow-hidden"
             style={{
               borderColor: "rgba(139,92,246,0.3)",
               background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(59,130,246,0.06))",
             }}>
          <div className="absolute -right-6 -top-6 opacity-10">
            <Sparkles className="h-32 w-32" style={{ color: "rgb(139,92,246)" }} />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4" style={{ color: "rgb(139,92,246)" }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgb(139,92,246)" }}>
                Free LLM Models
              </span>
            </div>
            <p className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
              {counts["llm-models"] ?? 0} free model{(counts["llm-models"] ?? 0) !== 1 ? "s" : ""} ready to plug into Hermes when you run low on quota
            </p>
            <div className="flex gap-2 flex-wrap">
              {freeModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openItem(m)}
                  className="group flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left transition-all hover:-translate-y-0.5"
                  style={{ background: "var(--surface)", borderColor: "rgba(139,92,246,0.25)", maxWidth: "240px" }}
                >
                  <span className="text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>
                    {m.title.replace(/^Free model:\s*/, "")}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "rgb(139,92,246)" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Category filter bar ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All" count={items.length} rgb="120,120,130" icon={Newspaper} />
        {CATEGORIES.filter((c) => (counts[c.key] ?? 0) > 0).map((c) => (
          <CatChip
            key={c.key}
            active={activeCat === c.key}
            onClick={() => setActiveCat(c.key)}
            label={c.label}
            count={counts[c.key] ?? 0}
            rgb={c.rgb}
            icon={c.icon}
          />
        ))}
      </div>

      {/* ── View toggles ── */}
      <div className="flex items-center gap-1.5">
        {([
          { k: "all" as const,    l: "Everything", n: items.length },
          { k: "unread" as const, l: "Unread",     n: unreadCount },
          { k: "pinned" as const, l: "Pinned",     n: pinnedCount },
        ]).map((v) => {
          const active = view === v.k;
          return (
            <button
              key={v.k}
              onClick={() => setView(v.k)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
              style={{
                background: active ? "var(--text)" : "var(--surface-muted)",
                color:      active ? "var(--surface)" : "var(--text-muted)",
              }}
            >
              {v.l} {v.n > 0 && <span className="tabular-nums opacity-70">· {v.n}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Feed ── */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border py-20 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <Inbox className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {items.length === 0 ? "No news yet" : "Nothing matches these filters"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
            {items.length === 0
              ? "The daily fetch runs at 5 AM — check back soon."
              : "Try a different category or view."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((it) => (
            <NewsCard
              key={it.id}
              item={it}
              busy={busyId === it.id}
              onOpen={() => openItem(it)}
              onTogglePin={(e) => togglePin(e, it)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ── Category chip ────────────────────────────────────────────────────────────
function CatChip({
  active, onClick, label, count, rgb, icon: Icon,
}: {
  active: boolean; onClick: () => void; label: string; count: number; rgb: string; icon: typeof Bot;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all border"
      style={{
        background: active ? `rgba(${rgb},0.12)` : "var(--surface)",
        borderColor: active ? `rgba(${rgb},0.4)` : "var(--border)",
        color: active ? `rgb(${rgb})` : "var(--text-muted)",
      }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: active ? `rgb(${rgb})` : "var(--text-quiet)" }} />
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

// ── News card ────────────────────────────────────────────────────────────────
function NewsCard({
  item, busy, onOpen, onTogglePin,
}: {
  item: NewsItem; busy: boolean; onOpen: () => void; onTogglePin: (e: React.MouseEvent) => void;
}) {
  const m = meta(item.category);
  const Icon = m.icon;
  const when = item.published_at ?? item.created_at;

  return (
    <div
      onClick={onOpen}
      className="group relative flex flex-col rounded-xl border p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
      style={{
        background: "var(--surface)",
        borderColor: item.is_pinned ? `rgba(${m.rgb},0.35)` : "var(--border)",
        opacity: item.is_read ? 0.72 : 1,
      }}
    >
      {/* top row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: `rgba(${m.rgb},0.12)`, color: `rgb(${m.rgb})` }}>
          <Icon className="h-3 w-3" />
          {m.label}
        </span>
        {!item.is_read && (
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} title="Unread" />
        )}
        <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--text-quiet)" }}>
          {timeAgo(when)}
        </span>
        <button
          onClick={onTogglePin}
          disabled={busy}
          className="rounded-md p-1 transition-colors hover:bg-[var(--surface-muted)]"
          title={item.is_pinned ? "Unpin" : "Pin"}
        >
          <Pin
            className="h-3.5 w-3.5"
            style={{
              color: item.is_pinned ? `rgb(${m.rgb})` : "var(--text-quiet)",
              fill: item.is_pinned ? `rgb(${m.rgb})` : "transparent",
            }}
          />
        </button>
      </div>

      {/* title */}
      <h3 className="text-sm font-semibold leading-snug mb-1 group-hover:text-[var(--accent)] transition-colors"
          style={{ color: "var(--text)" }}>
        {item.title}
      </h3>

      {/* summary */}
      {item.summary && (
        <p className="text-[12px] leading-relaxed line-clamp-3 mb-3" style={{ color: "var(--text-muted)" }}>
          {item.summary}
        </p>
      )}

      {/* footer */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-quiet)" }}>
          {item.source}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--accent)" }}>
          Open <ExternalLink className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
