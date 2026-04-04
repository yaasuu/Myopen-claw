"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Calendar,
  FolderOpen,
  Database,
  Archive,
  FileText,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import {
  getDailyNotes,
  getKnowledgeEntries,
  type DailyNote,
  type KnowledgeEntry,
  type PARACategory,
} from "@/lib/data/knowledge";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";

const CATEGORIES: { value: PARACategory | "all"; label: string; icon: typeof FolderOpen; color: string }[] = [
  { value: "all", label: "All", icon: BookOpen, color: "text-muted-foreground" },
  { value: "project", label: "Projects", icon: FolderOpen, color: "text-[var(--info)]" },
  { value: "area", label: "Areas", icon: Database, color: "text-[var(--accent)]" },
  { value: "resource", label: "Resources", icon: FileText, color: "text-[var(--success)]" },
  { value: "archive", label: "Archives", icon: Archive, color: "text-[var(--text-quiet)]" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [notesR, knowledgeR] = await Promise.all([
        getDailyNotes(14),
        getKnowledgeEntries({
          category: filterCategory === "all" ? undefined : (filterCategory as PARACategory),
          search: search || undefined,
        }),
      ]);
      setDailyNotes(notesR.data);
      setKnowledge(knowledgeR.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [filterCategory, search]);
  useRealtimeMulti(["daily_notes", "knowledge_entries"], loadRef);

  useEffect(() => {
    load();
  }, [filterCategory]);

  function handleSearch() {
    load();
  }

  const todayNote = dailyNotes.length > 0 ? dailyNotes[0] : null;
  const previousNotes = dailyNotes.slice(1);

  if (loading) {
    return (
      <PageShell title="Notes & Knowledge" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Notes & Knowledge" description="Daily notes, knowledge base, and PARA-organized information">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">{error}</div>
      )}

      {/* Search + Filter */}
      <div className="action-bar">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent border-0 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search knowledge base..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* PARA category quick stats */}
      <div className="grid grid-cols-4 gap-3">
        {CATEGORIES.filter((c) => c.value !== "all").map((cat) => {
          const count = knowledge.filter((k) => k.category === cat.value).length;
          const CatIcon = cat.icon;
          return (
            <Card
              key={cat.value}
              className={`stat-card cursor-pointer transition-all ${filterCategory === cat.value ? "ring-2 ring-primary" : ""}`}
              onClick={() => setFilterCategory(filterCategory === cat.value ? "all" : cat.value)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <CatIcon className={`h-4 w-4 ${cat.color}`} />
                </div>
                <div>
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{cat.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Today's Daily Note / Sync Report */}
      {todayNote && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.08)]">
              <Calendar className="h-4 w-4 text-[var(--success)]" />
            </div>
            <h2 className="section-title">{todayNote.sync_type === "full_sync" ? "Daily Team Sync" : "Daily Note"} — {todayNote.date}</h2>
          </div>

          <Card className={`stat-card ${todayNote.sync_type === "full_sync" ? "border-l-4 border-l-[var(--accent)]" : "border-l-4 border-l-emerald-500"}`}>
            <CardContent className="p-5 space-y-4">
              {/* A. Executive Summary */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-1">A. Executive Summary</h3>
                <p className="text-sm">{todayNote.summary}</p>
              </div>

              {/* B. Agent Updates (if full sync) */}
              {todayNote.sync_type === "full_sync" && todayNote.agent_updates && todayNote.agent_updates.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-2">B. Agent / Department Updates</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {todayNote.agent_updates.map((agent: any) => (
                      <div key={agent.agent_id} className="rounded-md border p-3 bg-background/50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{agent.emoji}</span>
                          <span className="text-sm font-semibold">{agent.name}</span>
                          <Badge variant="outline" className="ml-auto text-[10px]">{agent.utilization}</Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>✅ Completed: {agent.workload.completed}</p>
                          <p>🚧 Active: {agent.workload.in_progress + agent.workload.in_review}</p>
                          {agent.blockers.length > 0 && (
                            <p className="text-[var(--danger)]">⚠️ Blockers: {agent.blockers.length}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* C. Cross-Team Coordination */}
              {todayNote.sync_type === "full_sync" && todayNote.cross_team_summary && (
                <div className="rounded-md border p-3 bg-background/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-2">C. Cross-Team Coordination</h3>
                  <div className="grid grid-cols-3 gap-2 text-center mb-2">
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-lg font-bold text-[var(--danger)]">{todayNote.cross_team_summary.total_blockers}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Blockers</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-lg font-bold text-[var(--info)]">{todayNote.cross_team_summary.total_in_review}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">In Review</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-lg font-bold text-[var(--warning)]">{todayNote.cross_team_summary.unassigned_open}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Unassigned</p>
                    </div>
                  </div>
                  {todayNote.cross_team_summary.coordination_notes?.map((note: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" /> {note}
                    </p>
                  ))}
                </div>
              )}

              {/* D. Skill Gaps */}
              {todayNote.sync_type === "full_sync" && todayNote.skill_gaps && todayNote.skill_gaps.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-1">D. Skill / Capability Gaps</h3>
                  {todayNote.skill_gaps.map((gap: any, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1">
                      <AlertCircle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" /> {gap.agent}: {gap.issue}
                    </p>
                  ))}
                </div>
              )}

              {/* E. Issues Faced */}
              {todayNote.issues_list && todayNote.issues_list.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-1">E. Issues Faced Today</h3>
                  {todayNote.issues_list.map((issue: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1">
                      <AlertTriangle className="h-3 w-3 text-[var(--danger)] mt-0.5 shrink-0" /> {issue}
                    </p>
                  ))}
                </div>
              )}

              {/* F. Next-Day Priorities & G. Decisions */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-1">F. Tomorrow's Priorities</h3>
                  {(todayNote.priorities_tomorrow || []).map((p: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <ChevronRight className="h-3 w-3 text-violet-500 mt-0.5 shrink-0" /> {p}
                    </p>
                  ))}
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-1">G. Yas Claw Decisions</h3>
                  {(todayNote.yas_decisions || todayNote.decisions || []).map((d: string, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" /> {d}
                    </p>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground pt-2 border-t flex justify-between">
                <span>{todayNote.events_reviewed} events reviewed</span>
                <span>Updated {timeAgo(todayNote.updated_at)}</span>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Previous Daily Notes */}
      {previousNotes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="section-title">Previous Days</h2>
          </div>

          <div className="space-y-3">
            {previousNotes
              .slice(0, 7)
              .map((note) => (
                <Card key={note.id} className="stat-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{note.date}</span>
                          <Badge variant="outline" className="text-[10px]">{note.events_reviewed} events</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{note.summary}</p>
                      </div>
                    </div>
                    {note.decisions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {note.decisions.slice(0, 3).map((d, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] truncate max-w-[200px]">{d}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}

      {/* Knowledge Entries */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.08)]">
            <BookOpen className="h-4 w-4 text-[var(--info)]" />
          </div>
          <h2 className="section-title">Knowledge Base</h2>
          <Badge className="bg-[rgba(59,130,246,0.12)] text-[var(--info)] text-xs">{knowledge.length}</Badge>
        </div>

        {knowledge.length === 0 ? (
          <Card className="stat-card">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No knowledge entries found
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {knowledge.map((entry) => {
              const cat = CATEGORIES.find((c) => c.value === entry.category);
              const CatIcon = cat?.icon ?? FileText;
              return (
                <Card key={entry.id} className="stat-card">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <CatIcon className={`h-4 w-4 ${cat?.color ?? "text-muted-foreground"}`} />
                        <p className="text-sm font-semibold">{entry.title}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{entry.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3">{entry.content}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {entry.source} · {timeAgo(entry.updated_at)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}
