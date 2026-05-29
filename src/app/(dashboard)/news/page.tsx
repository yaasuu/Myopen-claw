"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Newspaper, Sparkles, RefreshCw, Pin, ExternalLink, Bot,
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
  image_url?: string | null; // optional thumbnail (og:image), populated by backend fetch
}

type View = "latest" | "category" | "unread" | "pinned";

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

// ── Helpers ────────────────────────────────────────────────────────────────────
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function whenOf(it: NewsItem): string {
  return it.published_at ?? it.created_at;
}
function isFresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}
function cleanTitle(t: string): string {
  return t.replace(/^Free model:\s*/, "").replace(/^Trending model:\s*/, "");
}

// ── Source favicon (with category-icon fallback) ─────────────────────────────────
function SourceFavicon({ url, fallback: Fallback, rgb }: { url: string; fallback: typeof Bot; rgb: string }) {
  const host = hostOf(url);
  const [err, setErr] = useState(false);
  if (!host || err) return <Fallback className="h-3.5 w-3.5" style={{ color: `rgb(${rgb})` }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      className="rounded-sm shrink-0"
      onError={() => setErr(true)}
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const [items, setItems]     = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [activeCat, setActiveCat] = useState<string>("all");
  const [view, setView] = useState<View>("latest");
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
      const revert: Partial<NewsItem> = {};
      if (typeof body.is_pinned === "boolean") revert.is_pinned = !body.is_pinned;
      if (typeof body.is_read === "boolean") revert.is_read = !body.is_read;
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...revert } : it)));
    }
  }, []);

  const togglePin = useCallback(async (e: React.MouseEvent, it: NewsItem) => {
    e.preventDefault(); e.stopPropagation();
    setBusyId(it.id);
    await patch(it.id, { is_pinned: !it.is_pinned });
    setBusyId(null);
  }, [patch]);

  const openItem = useCallback((it: NewsItem) => {
    if (!it.is_read) patch(it.id, { is_read: true });
    window.open(it.url, "_blank", "noopener,noreferrer");
  }, [patch]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [items]);

  const unreadCount = useMemo(() => items.filter((i) => !i.is_read).length, [items]);
  const pinnedCount = useMemo(() => items.filter((i) => i.is_pinned).length, [items]);

  const lastSync = useMemo(() => {
    if (items.length === 0) return null;
    return items.reduce((max, it) =>
      new Date(it.created_at) > new Date(max) ? it.created_at : max, items[0].created_at);
  }, [items]);

  const freeModels = useMemo(
    () => items.filter((i) => i.category === "llm-models").slice(0, 6),
    [items]
  );

  const sortByDate = useCallback((a: NewsItem, b: NewsItem) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(whenOf(b)).getTime() - new Date(whenOf(a)).getTime();
  }, []);

  // Items after category + view filtering (flat views)
  const filtered = useMemo(() => {
    const base = items.filter((it) => {
      if (activeCat !== "all" && it.category !== activeCat) return false;
      if (view === "unread" && it.is_read) return false;
      if (view === "pinned" && !it.is_pinned) return false;
      return true;
    });
    return [...base].sort(sortByDate);
  }, [items, activeCat, view, sortByDate]);

  // Top Stories: 3 freshest non-model, non-pinned-priority stories (latest + all only)
  const showTopStories = view === "latest" && activeCat === "all";
  const topStories = useMemo(() => {
    if (!showTopStories) return [];
    return [...items]
      .filter((i) => i.category !== "llm-models")
      .sort((a, b) => new Date(whenOf(b)).getTime() - new Date(whenOf(a)).getTime())
      .slice(0, 3);
  }, [items, showTopStories]);

  const topIds = useMemo(() => new Set(topStories.map((t) => t.id)), [topStories]);
  const gridItems = useMemo(
    () => (showTopStories ? filtered.filter((i) => !topIds.has(i.id)) : filtered),
    [filtered, topIds, showTopStories]
  );

  // By-category grouping
  const grouped = useMemo(() => {
    if (view !== "category") return [];
    const cats = activeCat === "all" ? CATEGORIES.map((c) => c.key) : [activeCat];
    return cats
      .map((key) => ({
        meta: meta(key),
        items: items.filter((i) => i.category === key).sort(sortByDate),
      }))
      .filter((g) => g.items.length > 0);
  }, [items, view, activeCat, sortByDate]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageShell>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="h-3 w-20 rounded mb-3" style={{ background: "var(--surface-muted)" }} />
              <div className="h-4 w-full rounded mb-2" style={{ background: "var(--surface-muted)" }} />
              <div className="h-4 w-3/4 rounded mb-3" style={{ background: "var(--surface-muted)" }} />
              <div className="h-3 w-full rounded mb-1.5" style={{ background: "var(--surface-muted)" }} />
              <div className="h-3 w-2/3 rounded" style={{ background: "var(--surface-muted)" }} />
            </div>
          ))}
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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0" style={{ background: "var(--accent-soft)" }}>
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
          {lastSync && (
            <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-quiet)" }}>
              synced {timeAgo(lastSync)}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
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
      {view === "latest" && activeCat === "all" && freeModels.length > 0 && (
        <div className="rounded-2xl border p-5 relative overflow-hidden"
             style={{ borderColor: "rgba(139,92,246,0.3)", background: "linear-gradient(135deg, rgba(139,92,246,0.10), rgba(59,130,246,0.06))" }}>
          <div className="absolute -right-6 -top-6 opacity-10">
            <Sparkles className="h-32 w-32" style={{ color: "rgb(139,92,246)" }} />
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4" style={{ color: "rgb(139,92,246)" }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgb(139,92,246)" }}>Free LLM Models</span>
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
                  <span className="text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>{cleanTitle(m.title)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "rgb(139,92,246)" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Category rail ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All" count={items.length} rgb="120,120,130" icon={Newspaper} />
        {CATEGORIES.filter((c) => (counts[c.key] ?? 0) > 0).map((c) => (
          <CatChip key={c.key} active={activeCat === c.key} onClick={() => setActiveCat(c.key)} label={c.label} count={counts[c.key] ?? 0} rgb={c.rgb} icon={c.icon} />
        ))}
      </div>

      {/* ── View toggles ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          { k: "latest" as View,   l: "Latest",      n: items.length },
          { k: "category" as View, l: "By category", n: 0 },
          { k: "unread" as View,   l: "Unread",      n: unreadCount },
          { k: "pinned" as View,   l: "Pinned",      n: pinnedCount },
        ]).map((v) => {
          const active = view === v.k;
          return (
            <button
              key={v.k}
              onClick={() => setView(v.k)}
              className="rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
              style={{ background: active ? "var(--text)" : "var(--surface-muted)", color: active ? "var(--surface)" : "var(--text-muted)" }}
            >
              {v.l}{v.n > 0 && <span className="tabular-nums opacity-70"> · {v.n}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Top Stories band ── */}
      {showTopStories && topStories.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-quiet)" }}>Top Stories</span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topStories.map((it) => (
              <FeaturedCard key={it.id} item={it} busy={busyId === it.id} onOpen={() => openItem(it)} onTogglePin={(e) => togglePin(e, it)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Feed ── */}
      {view === "category" ? (
        grouped.length === 0 ? (
          <EmptyState hasItems={items.length > 0} />
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <section key={g.meta.key}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
                        style={{ background: `rgba(${g.meta.rgb},0.12)`, color: `rgb(${g.meta.rgb})` }}>
                    <g.meta.icon className="h-3.5 w-3.5" /> {g.meta.label}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--text-quiet)" }}>{g.items.length}</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.items.map((it) => (
                    <NewsCard key={it.id} item={it} busy={busyId === it.id} onOpen={() => openItem(it)} onTogglePin={(e) => togglePin(e, it)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : gridItems.length === 0 && topStories.length === 0 ? (
        <EmptyState hasItems={items.length > 0} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {gridItems.map((it) => (
            <NewsCard key={it.id} item={it} busy={busyId === it.id} onOpen={() => openItem(it)} onTogglePin={(e) => togglePin(e, it)} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ hasItems }: { hasItems: boolean }) {
  return (
    <div className="rounded-xl border py-20 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <Inbox className="h-10 w-10 mx-auto mb-2" style={{ color: "var(--text-quiet)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{hasItems ? "Nothing matches these filters" : "No news yet"}</p>
      <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
        {hasItems ? "Try a different category or view." : "The daily fetch runs at 5 AM — check back soon."}
      </p>
    </div>
  );
}

// ── Category chip ────────────────────────────────────────────────────────────
function CatChip({ active, onClick, label, count, rgb, icon: Icon }: {
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

// ── Card media header (thumbnail OR gradient-icon fallback) ───────────────────
function CardMedia({ item, m, Icon, height, busy, onTogglePin }: {
  item: NewsItem; m: CatMeta; Icon: typeof Bot; height: number;
  busy: boolean; onTogglePin: (e: React.MouseEvent) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const hasImg = !!item.image_url && !imgErr;
  const when = whenOf(item);
  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      {hasImg ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url as string}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgErr(true)}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0) 45%, rgba(0,0,0,0.05))" }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center"
             style={{ background: `linear-gradient(135deg, rgba(${m.rgb},0.20), rgba(${m.rgb},0.05))` }}>
          <Icon style={{ color: `rgb(${m.rgb})`, width: height * 0.38, height: height * 0.38, opacity: 0.28 }} />
        </div>
      )}

      {/* category pill */}
      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm"
            style={{ background: hasImg ? "rgba(0,0,0,0.55)" : `rgba(${m.rgb},0.14)`, color: hasImg ? "#fff" : `rgb(${m.rgb})` }}>
        <Icon className="h-3 w-3" /> {m.label}
      </span>

      {/* NEW badge */}
      {isFresh(when) && (
        <span className="absolute left-2 bottom-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: "var(--success)", color: "#fff" }}>New</span>
      )}

      {/* pin */}
      <button
        onClick={onTogglePin}
        disabled={busy}
        className="absolute right-2 top-2 rounded-md p-1 transition-colors backdrop-blur-sm hover:opacity-80"
        style={{ background: hasImg ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.55)" }}
        title={item.is_pinned ? "Unpin" : "Pin"}
      >
        <Pin className="h-3.5 w-3.5"
             style={{ color: item.is_pinned ? `rgb(${m.rgb})` : (hasImg ? "#fff" : "var(--text-quiet)"), fill: item.is_pinned ? `rgb(${m.rgb})` : "transparent" }} />
      </button>
    </div>
  );
}

// ── Featured (Top Stories) card ──────────────────────────────────────────────
function FeaturedCard({ item, busy, onOpen, onTogglePin }: {
  item: NewsItem; busy: boolean; onOpen: () => void; onTogglePin: (e: React.MouseEvent) => void;
}) {
  const m = meta(item.category);
  const Icon = m.icon;
  const when = whenOf(item);
  return (
    <div
      onClick={onOpen}
      className="group relative flex flex-col rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] overflow-hidden"
      style={{ background: "var(--surface)", borderColor: item.is_pinned ? `rgba(${m.rgb},0.4)` : "var(--border)" }}
    >
      <CardMedia item={item} m={m} Icon={Icon} height={144} busy={busy} onTogglePin={onTogglePin} />
      <div className="flex flex-col flex-1 p-4">
        <h3 className="text-[15px] font-bold leading-snug mb-1.5 line-clamp-2 group-hover:text-[var(--accent)] transition-colors" style={{ color: "var(--text)" }}>
          {cleanTitle(item.title)}
        </h3>
        {item.summary && <p className="text-[12px] leading-relaxed line-clamp-2 mb-3" style={{ color: "var(--text-muted)" }}>{item.summary}</p>}
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          <SourceFavicon url={item.url} fallback={Icon} rgb={m.rgb} />
          <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-quiet)" }}>{item.source}</span>
          <span className="text-[11px] tabular-nums ml-auto" style={{ color: "var(--text-quiet)" }}>{timeAgo(when)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Standard news card ─────────────────────────────────────────────────────────
function NewsCard({ item, busy, onOpen, onTogglePin }: {
  item: NewsItem; busy: boolean; onOpen: () => void; onTogglePin: (e: React.MouseEvent) => void;
}) {
  const m = meta(item.category);
  const Icon = m.icon;
  return (
    <div
      onClick={onOpen}
      className="group relative flex flex-col rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] overflow-hidden"
      style={{ background: "var(--surface)", borderColor: item.is_pinned ? `rgba(${m.rgb},0.35)` : "var(--border)", opacity: item.is_read ? 0.72 : 1 }}
    >
      <CardMedia item={item} m={m} Icon={Icon} height={112} busy={busy} onTogglePin={onTogglePin} />
      <div className="flex flex-col flex-1 p-4">
        <h3 className="text-sm font-semibold leading-snug mb-1 line-clamp-2 group-hover:text-[var(--accent)] transition-colors" style={{ color: "var(--text)" }}>
          {cleanTitle(item.title)}
        </h3>
        {item.summary && <p className="text-[12px] leading-relaxed line-clamp-3 mb-3" style={{ color: "var(--text-muted)" }}>{item.summary}</p>}
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          <SourceFavicon url={item.url} fallback={Icon} rgb={m.rgb} />
          <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-quiet)" }}>{item.source}</span>
          {!item.is_read && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} title="Unread" />}
          <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent)" }}>
            Open <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
