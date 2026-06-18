import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAllNews } from "@/lib/news/sources";
import { checkCronAuth } from "@/lib/auth/cron-auth";

/**
 * GET/POST /api/cron/fetch-news
 *
 * Daily cron. Fetches news from real sources (OpenRouter, Hugging Face,
 * Google News RSS), dedupes by URL, and upserts into news_items.
 * Also prunes items older than 30 days to keep the table lean.
 *
 * Protected by CRON_SECRET (if set) — Authorization: Bearer <secret>
 */

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function runFetch(): Promise<NextResponse> {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // 1. Fetch from all sources
  const items = await fetchAllNews();
  if (items.length === 0) {
    return NextResponse.json({ ok: true, fetched: 0, inserted: 0, note: "No items returned from sources" });
  }

  // 2. Dedupe within this batch by URL (sources can overlap)
  const byUrl = new Map<string, (typeof items)[number]>();
  for (const it of items) {
    if (it.url && !byUrl.has(it.url)) byUrl.set(it.url, it);
  }
  const unique = Array.from(byUrl.values());

  // 3. Upsert (ignore duplicates via unique url constraint)
  const rows = unique.map((it) => ({
    category: it.category,
    title: it.title,
    summary: it.summary,
    url: it.url,
    source: it.source,
    published_at: it.published_at,
  }));

  const { data: inserted, error } = await supabase
    .from("news_items")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message, fetched: unique.length }, { status: 500 });
  }

  // 4a. Prune items older than 30 days by insert date (keep pinned ones)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("news_items")
    .delete()
    .lt("created_at", cutoff)
    .eq("is_pinned", false);

  // 4b. Prune stale *news articles* — anything published more than 14 days ago.
  // Keeps the feed fresh. Excludes "llm-models" (free OpenRouter models are
  // evergreen, not time-sensitive news) and pinned items. Items with a null
  // published_at are left untouched (the .lt filter skips nulls).
  const freshCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("news_items")
    .delete()
    .lt("published_at", freshCutoff)
    .eq("is_pinned", false)
    .neq("category", "llm-models");

  // 5. Log to feed_events (non-critical)
  try {
    await supabase.from("feed_events").insert({
      event_type: "system_alert",
      source: "News Fetcher",
      summary: `News feed refreshed — ${inserted?.length ?? 0} new item(s) across ${unique.length} fetched`,
    });
  } catch { /* non-critical */ }

  return NextResponse.json({
    ok: true,
    fetched: unique.length,
    inserted: inserted?.length ?? 0,
  });
}

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;
  return runFetch();
}

export async function POST(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;
  return runFetch();
}
