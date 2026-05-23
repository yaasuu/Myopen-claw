// src/app/api/hermes-skills/route.ts
// Proxies the ClawHub public skills registry used by Hermes.
// Caches for 1 hour so the skills page doesn't hit ClawHub on every load.

import { NextResponse } from "next/server";

export const runtime = "edge";

interface ClawHubItem {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: {
    downloads: number;
    stars: number;
    versions: number;
  };
  latestVersion: {
    version: string;
    changelog: string | null;
    license: string | null;
  } | null;
  metadata: Record<string, unknown> | null;
}

export async function GET() {
  try {
    const res = await fetch("https://clawhub.ai/api/v1/skills", {
      headers: { "Accept": "application/json" },
      next: { revalidate: 3600 }, // cache 1 hour on Vercel edge
    });

    if (!res.ok) {
      return NextResponse.json({ items: [], error: `ClawHub returned ${res.status}` }, { status: 200 });
    }

    const raw = await res.json() as { items?: ClawHubItem[] };
    const items = raw.items ?? [];

    // Normalise: extract topic tags (keys other than "latest"), derive category
    const normalized = items.map((item) => {
      const topicTags = Object.keys(item.tags ?? {}).filter((k) => k !== "latest");
      // Derive a single category from topic tags using a priority map
      const categoryMap: Record<string, string> = {
        communication: "communication", email: "communication", slack: "communication", telegram: "communication",
        analysis: "analysis", data: "analysis", report: "analysis", analytics: "analysis",
        automation: "automation", cron: "automation", workflow: "automation", trigger: "automation",
        writing: "writing", content: "writing", docs: "writing", markdown: "writing",
        research: "research", search: "research", browse: "research", web: "research",
        operations: "operations", devops: "operations", deploy: "operations", infra: "operations",
        development: "development", code: "development", git: "development", github: "development",
        utility: "utility", tool: "utility", helper: "utility",
      };
      let category = "utility";
      for (const tag of topicTags) {
        const mapped = categoryMap[tag.toLowerCase()];
        if (mapped) { category = mapped; break; }
      }
      return {
        slug: item.slug,
        displayName: item.displayName,
        summary: item.summary,
        tags: topicTags,
        category,
        downloads: item.stats?.downloads ?? 0,
        stars: item.stats?.stars ?? 0,
        version: item.latestVersion?.version ?? null,
      };
    });

    return NextResponse.json({ items: normalized });
  } catch (err) {
    console.error("hermes-skills proxy error:", err);
    return NextResponse.json({ items: [], error: "Failed to fetch from ClawHub" }, { status: 200 });
  }
}
