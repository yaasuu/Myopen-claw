import { getSupabase } from "@/lib/supabase/client";
import { getFeedEvents } from "@/lib/data/feed";
import { getTasks } from "@/lib/data/tasks";
import { getAgents } from "@/lib/data/agents";
import type { FeedEvent, TaskWithAgent, Agent } from "@/types/dashboard";

// ── Types ────────────────────────────────────────────

export type PARACategory = "project" | "area" | "resource" | "archive";

export interface DailyNote {
  id: string;
  date: string;
  summary: string;
  events_reviewed: number;
  decisions: string[];
  blockers: string[];
  priorities_tomorrow: string[];
  wins?: string[];
  // Full sync fields (A-G report)
  agent_updates?: any[];
  cross_team_summary?: any;
  skill_gaps?: any[];
  issues_list?: string[];
  yas_decisions?: string[];
  sync_type?: "basic" | "full_sync";
  created_at: string;
  updated_at: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: PARACategory;
  tags: string[];
  related_task_id: string | null;
  related_agent_id: string | null;
  related_department_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

function normalizeArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeDailyNote(note: Partial<DailyNote> & Record<string, unknown>): DailyNote {
  return {
    ...(note as DailyNote),
    decisions: normalizeArray<string>(note.decisions),
    blockers: normalizeArray<string>(note.blockers),
    priorities_tomorrow: normalizeArray<string>(note.priorities_tomorrow),
    agent_updates: normalizeArray(note.agent_updates),
    skill_gaps: normalizeArray(note.skill_gaps),
    issues_list: normalizeArray<string>(note.issues_list),
    yas_decisions: normalizeArray<string>(note.yas_decisions),
    wins: normalizeArray<string>(note.wins),
    cross_team_summary: note.cross_team_summary && typeof note.cross_team_summary === 'object' ? note.cross_team_summary : {},
    sync_type: (note.sync_type as DailyNote['sync_type']) ?? 'basic',
  };
}

// ── Mock Data ────────────────────────────────────────

const MOCK_DAILY_NOTES: DailyNote[] = [
  {
    id: "dn-1",
    date: "2026-03-30",
    summary: "Built Phase 6A-6D: CEO Hiring Console, Autonomy Center, Departments & Specialists, Skills System. Fixed auth login loop. Deployed to Vercel.",
    events_reviewed: 47,
    decisions: [
      "Adopted ClawHub as skill source with security scanning",
      "Set 2 skills/month quota per agent",
      "Added Security Auditor for skill approval",
      "Made kanban board the default task view",
    ],
    blockers: [
      "Auth login loop caused by wrong Supabase client (fixed)",
      "system_status table missing seed data causing .single() error (fixed)",
    ],
    priorities_tomorrow: [
      "Run SQL migrations 004-006 in Supabase",
      "Test skills approval flow end-to-end",
      "Review hiring recommendations with real data",
      "Verify nightly cron generates daily summary",
    ],
    created_at: "2026-03-30T00:00:00Z",
    updated_at: new Date().toISOString(),
  },
  {
    id: "dn-2",
    date: "2026-03-29",
    summary: "Initial dashboard setup. Created agent types, task system, Supabase schema, Vercel deployment.",
    events_reviewed: 22,
    decisions: [
      "Used Next.js 16 + Supabase + shadcn/ui stack",
      "Three persistent departments: Export-Growth, Ops-Improvement, Architecture-Systems",
      "Vercel auto-deploy on git push",
    ],
    blockers: [],
    priorities_tomorrow: ["Build task operations", "Add auth"],
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-29T23:00:00Z",
  },
];

const MOCK_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "ke-1",
    title: "Yas Claw System Architecture",
    content: "Next.js 16 App Router, Supabase (auth + DB + realtime), shadcn/ui, Tailwind CSS 4, Zustand state, React Flow for org chart. Deployed on Vercel with auto-deploy from GitHub.",
    category: "area",
    tags: ["architecture", "stack", "infrastructure"],
    related_task_id: null,
    related_agent_id: null,
    related_department_id: null,
    source: "manual",
    created_at: "2026-03-29T00:00:00Z",
    updated_at: "2026-03-30T00:00:00Z",
  },
  {
    id: "ke-2",
    title: "Auth Fix — SSR Cookie Pattern",
    content: "Client must use createBrowserClient from @supabase/ssr (not createClient from @supabase/supabase-js). Browser-only client stores in localStorage, middleware reads cookies. SSR client syncs both. Login must use window.location.href for hard redirect.",
    category: "resource",
    tags: ["auth", "supabase", "ssr", "fix"],
    related_task_id: null,
    related_agent_id: null,
    related_department_id: null,
    source: "auto-daily",
    created_at: "2026-03-30T19:00:00Z",
    updated_at: "2026-03-30T19:00:00Z",
  },
  {
    id: "ke-3",
    title: "Department Structure",
    content: "Export-Growth: export execution, leads, buyer follow-up, shipment planning. Ops-Improvement: workflows, process improvement, routines, automation. Architecture-Systems: platform design, data modeling, system architecture, integration.",
    category: "area",
    tags: ["departments", "structure", "organization"],
    related_task_id: null,
    related_agent_id: null,
    related_department_id: null,
    source: "manual",
    created_at: "2026-03-28T00:00:00Z",
    updated_at: "2026-03-30T00:00:00Z",
  },
  {
    id: "ke-4",
    title: "Skill Security Scanner Rules",
    content: "Blocks: shell injection (rm -rf, sudo, curl|sh), exec/eval/system calls, process.env access, network calls, credential patterns, base64 encoding, hacking tools. Flags: browser DOM access, localStorage, setTimeout, FileReader. Clean = approve, Suspicious = manual review, Blocked = auto-reject.",
    category: "resource",
    tags: ["security", "skills", "scanner"],
    related_task_id: null,
    related_agent_id: null,
    related_department_id: null,
    source: "auto-daily",
    created_at: "2026-03-30T21:00:00Z",
    updated_at: "2026-03-30T21:00:00Z",
  },
];

// ── Daily Notes CRUD ─────────────────────────────────

export async function getDailyNotes(limit = 30): Promise<{ data: DailyNote[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_DAILY_NOTES.map((note) => normalizeDailyNote(note as Partial<DailyNote> & Record<string, unknown>)), error: null };

  const { data, error } = await supabase
    .from("daily_notes")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(normalizeDailyNote) as DailyNote[], error: null };
}

export async function getDailyNote(date: string): Promise<{ data: DailyNote | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    const note = MOCK_DAILY_NOTES.find((n) => n.date === date);
    return { data: note ? normalizeDailyNote(note as Partial<DailyNote> & Record<string, unknown>) : null, error: null };
  }

  const { data, error } = await supabase
    .from("daily_notes")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data ? normalizeDailyNote(data) : null, error: null };
}

export async function generateDailySummary(date?: string): Promise<{ data: DailyNote | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const startOfDay = `${targetDate}T00:00:00Z`;
  const endOfDay = `${targetDate}T23:59:59Z`;

  // Fetch today's feed events
  const { data: events } = await supabase
    .from("feed_events")
    .select("*")
    .gte("created_at", startOfDay)
    .lte("created_at", endOfDay)
    .order("created_at", { ascending: true });

  const feedEvents = (events ?? []) as FeedEvent[];

  // Categorize events
  const decisions: string[] = [];
  const blockers: string[] = [];
  const priorities: string[] = [];

  for (const event of feedEvents) {
    if (event.event_type === "task_completed") {
      decisions.push(`Completed: ${event.summary}`);
    }
    if (event.event_type === "blocker_detected") {
      blockers.push(event.summary);
    }
    if (event.event_type === "agent_hired" || event.event_type === "skill_approved") {
      decisions.push(event.summary);
    }
    if (event.event_type === "blocker_resolved") {
      decisions.push(`Resolved: ${event.summary}`);
    }
  }

  // Generate summary
  const eventTypes = new Set(feedEvents.map((e) => e.event_type));
  const summaryParts: string[] = [];
  if (eventTypes.has("task_created")) summaryParts.push("new tasks created");
  if (eventTypes.has("task_completed")) summaryParts.push("tasks completed");
  if (eventTypes.has("agent_hired")) summaryParts.push("agents hired");
  if (eventTypes.has("blocker_detected")) summaryParts.push("blockers detected");
  if (eventTypes.has("skill_approved")) summaryParts.push("skills approved");

  const summary = feedEvents.length > 0
    ? `${feedEvents.length} events: ${summaryParts.join(", ") || "various activity"}.`
    : "No activity recorded today.";

  // Tomorrow priorities from unresolved blockers
  if (blockers.length > 0) {
    priorities.push(`Resolve ${blockers.length} blocker(s)`);
  }

  // Upsert daily note
  const { data: note, error } = await supabase
    .from("daily_notes")
    .upsert({
      date: targetDate,
      summary,
      events_reviewed: feedEvents.length,
      decisions,
      blockers,
      priorities_tomorrow: priorities,
      updated_at: new Date().toISOString(),
    }, { onConflict: "date" })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: note as DailyNote, error: null };
}

// ── Knowledge Entries CRUD ───────────────────────────

export async function getKnowledgeEntries(options?: {
  category?: PARACategory;
  search?: string;
}): Promise<{ data: KnowledgeEntry[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    let data = MOCK_KNOWLEDGE;
    if (options?.category) data = data.filter((e) => e.category === options.category);
    if (options?.search) {
      const q = options.search.toLowerCase();
      data = data.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return { data, error: null };
  }

  let query = supabase.from("knowledge_entries").select("*").order("updated_at", { ascending: false });
  if (options?.category) query = query.eq("category", options.category);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  // Normalise plural/variant category values from the DB to the expected singular PARACategory keys
  const categoryMap: Record<string, PARACategory> = {
    projects: "project", project: "project",
    areas:    "area",    area:    "area",
    resources:"resource",resource:"resource",
    archives: "archive", archive: "archive",
  };

  let results = ((data ?? []) as KnowledgeEntry[]).map((e) => ({
    ...e,
    category: categoryMap[String(e.category).toLowerCase()] ?? "resource",
  }));
  if (options?.search) {
    const q = options.search.toLowerCase();
    results = results.filter((e) =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  return { data: results, error: null };
}

export async function createKnowledgeEntry(input: {
  title: string;
  content: string;
  category: PARACategory;
  tags?: string[];
  relatedTaskId?: string;
  relatedAgentId?: string;
  source?: string;
}): Promise<{ data: KnowledgeEntry | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("knowledge_entries")
    .insert({
      title: input.title,
      content: input.content,
      category: input.category,
      tags: input.tags ?? [],
      related_task_id: input.relatedTaskId ?? null,
      related_agent_id: input.relatedAgentId ?? null,
      source: input.source ?? "manual",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as KnowledgeEntry, error: null };
}

export async function updateKnowledgeEntry(
  id: string,
  updates: Partial<Pick<KnowledgeEntry, "title" | "content" | "category" | "tags">>
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Supabase not connected" };

  const { error } = await supabase
    .from("knowledge_entries")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  return { error: error?.message ?? null };
}
