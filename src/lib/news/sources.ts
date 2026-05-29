/**
 * News source adapters — all use real, free, public sources.
 * No LLM calls, no hallucination.
 *
 *  - OpenRouter /models API → new free LLM models
 *  - Hugging Face API       → trending AI models
 *  - Google News RSS        → everything else (keyword search, no API key)
 */

export interface RawNewsItem {
  category: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  published_at: string | null; // ISO string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

// Minimal RSS 2.0 parser — Google News RSS is predictable, no deps needed.
function parseRssItems(xml: string): Array<{
  title: string; link: string; pubDate: string | null; description: string; source: string;
}> {
  const items: Array<{ title: string; link: string; pubDate: string | null; description: string; source: string }> = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    const pick = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? stripHtml(m[1]) : "";
    };
    const title = pick("title");
    const link = pick("link");
    const pubDateRaw = pick("pubDate");
    const description = pick("description");
    const source = pick("source");
    if (!title || !link) continue;

    let pubDate: string | null = null;
    if (pubDateRaw) {
      const d = new Date(pubDateRaw);
      if (!isNaN(d.getTime())) pubDate = d.toISOString();
    }
    items.push({ title, link, pubDate, description, source });
  }
  return items;
}

// ── Google News RSS (keyword search) ─────────────────────────────────────────

async function fetchGoogleNews(query: string, category: string, limit = 6): Promise<RawNewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YasClawNewsBot/1.0)" },
    });
    if (!res.ok) { console.error(`Google News ${category} HTTP ${res.status}`); return []; }
    const xml = await res.text();
    return parseRssItems(xml)
      .slice(0, limit)
      .map((it) => ({
        category,
        title: truncate(it.title.replace(/ - [^-]+$/, ""), 180), // Google News appends " - Publisher"
        summary: truncate(it.description || it.title, 240),
        url: it.link,
        source: it.source || "Google News",
        published_at: it.pubDate,
      }));
  } catch (e) {
    console.error(`Google News ${category} failed:`, e);
    return [];
  }
}

// ── OpenRouter — new free models ─────────────────────────────────────────────

export async function fetchOpenRouterFreeModels(limit = 10): Promise<RawNewsItem[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "User-Agent": "YasClawNewsBot/1.0" },
    });
    if (!res.ok) { console.error(`OpenRouter HTTP ${res.status}`); return []; }
    const json = await res.json() as {
      data?: Array<{
        id: string; name?: string; description?: string; context_length?: number;
        created?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const free = (json.data ?? []).filter((m) => {
      const p = m.pricing?.prompt;
      return p === "0" || p === "0.0" || m.id.endsWith(":free");
    });
    // Newest first by created timestamp when available
    free.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    return free.slice(0, limit).map((m) => ({
      category: "llm-models",
      title: `Free model: ${m.name || m.id}`,
      summary: truncate(
        `${m.description || "Free model available on OpenRouter."}${
          m.context_length ? ` · Context: ${m.context_length.toLocaleString()} tokens` : ""
        }`,
        240
      ),
      url: `https://openrouter.ai/${m.id.replace(/:free$/, "")}`,
      source: "OpenRouter",
      published_at: m.created ? new Date(m.created * 1000).toISOString() : null,
    }));
  } catch (e) {
    console.error("OpenRouter fetch failed:", e);
    return [];
  }
}

// ── Hugging Face — trending models ───────────────────────────────────────────

export async function fetchHuggingFaceTrending(limit = 6): Promise<RawNewsItem[]> {
  try {
    const res = await fetch(
      "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=" + limit,
      { headers: { "User-Agent": "YasClawNewsBot/1.0" } }
    );
    if (!res.ok) { console.error(`HuggingFace HTTP ${res.status}`); return []; }
    const json = await res.json() as Array<{
      id?: string; modelId?: string; pipeline_tag?: string; likes?: number; downloads?: number;
      lastModified?: string;
    }>;
    return (json ?? []).slice(0, limit).map((m) => {
      const id = m.id || m.modelId || "unknown";
      return {
        category: "ai",
        title: `Trending model: ${id}`,
        summary: truncate(
          `${m.pipeline_tag ? `${m.pipeline_tag} · ` : ""}${
            m.likes ? `${m.likes.toLocaleString()} likes · ` : ""
          }${m.downloads ? `${m.downloads.toLocaleString()} downloads` : ""}`,
          240
        ) || "Trending on Hugging Face.",
        url: `https://huggingface.co/${id}`,
        source: "Hugging Face",
        published_at: m.lastModified ? new Date(m.lastModified).toISOString() : null,
      };
    });
  } catch (e) {
    console.error("HuggingFace fetch failed:", e);
    return [];
  }
}

// ── Category → Google News query map ─────────────────────────────────────────

const GOOGLE_NEWS_QUERIES: Array<{ category: string; query: string }> = [
  { category: "hermes",     query: "Anthropic Claude OR Google Gemini OR OpenRouter LLM model release" },
  { category: "technology", query: "technology innovation" },
  { category: "ai",         query: "artificial intelligence breakthrough" },
  { category: "export",     query: "export trade business growth" },
  { category: "tariffs",    query: "tariffs trade policy import duty" },
  { category: "shipping",   query: "shipping logistics freight container" },
  { category: "forex",      query: "forex currency exchange rate dollar" },
  { category: "compliance", query: "export compliance customs regulation" },
];

// ── Master fetch — runs all sources in parallel ──────────────────────────────

export async function fetchAllNews(): Promise<RawNewsItem[]> {
  const tasks: Promise<RawNewsItem[]>[] = [
    fetchOpenRouterFreeModels(10),
    fetchHuggingFaceTrending(6),
    ...GOOGLE_NEWS_QUERIES.map((q) => fetchGoogleNews(q.query, q.category, 6)),
  ];

  const results = await Promise.allSettled(tasks);
  const items: RawNewsItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") items.push(...r.value);
  }
  return items;
}

export const NEWS_CATEGORIES = [
  "llm-models", "hermes", "technology", "ai",
  "export", "tariffs", "shipping", "forex", "compliance",
] as const;
