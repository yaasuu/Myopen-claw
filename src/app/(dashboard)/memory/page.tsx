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
  Loader2,
  AlertTriangle,
  RefreshCw,
  Search,
  Brain,
  Clock,
  FileText,
  ChevronRight,
} from "lucide-react";
import { getKnowledgeEntries, type KnowledgeEntry } from "@/lib/data/knowledge";
import { getDailyNotes, type DailyNote } from "@/lib/data/knowledge";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MemoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [selectedNote, setSelectedNote] = useState<DailyNote | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [entriesR, notesR] = await Promise.all([
        getKnowledgeEntries({ search: search || undefined }),
        getDailyNotes(14),
      ]);
      setEntries(entriesR.data);
      setDailyNotes(notesR.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), [search]);
  useRealtimeMulti(["knowledge_entries", "daily_notes"], loadRef);

  useEffect(() => { load(); }, []);

  function handleSearch() {
    load();
  }

  if (loading) {
    return (
      <PageShell title="Memory" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading memories...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Memory" description="All memories, decisions, and knowledge — searchable and organized">
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>{error}</div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-quiet)" }} />
          <input
            className="w-full rounded-lg border pl-10 pr-4 py-2 text-sm"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch}>
          Search
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Knowledge Entries */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="icon-box-sm" style={{ background: "var(--accent-soft)" }}>
              <Brain className="h-4 w-4" style={{ color: "var(--accent)" }} />
            </div>
            <h2 className="section-title">Knowledge Base</h2>
            <Badge className="bg-blue-100 text-blue-700 text-xs">{entries.length}</Badge>
          </div>

          {entries.length === 0 ? (
            <Card className="surface-card">
              <CardContent className="py-8 text-center text-sm" style={{ color: "var(--text-quiet)" }}>
                No memories found
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <Card
                  key={entry.id}
                  className={`surface-card-hover cursor-pointer ${selectedEntry?.id === entry.id ? "ring-2 ring-[var(--accent)]" : ""}`}
                  onClick={() => { setSelectedEntry(entry); setSelectedNote(null); }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{entry.title}</p>
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)" }}>{entry.content}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{entry.category}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                      <span className="text-[10px] ml-auto" style={{ color: "var(--text-quiet)" }}>{timeAgo(entry.updated_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Daily Notes */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="icon-box-sm" style={{ background: "rgba(245,158,11,0.08)" }}>
              <Clock className="h-4 w-4" style={{ color: "var(--warning)" }} />
            </div>
            <h2 className="section-title">Daily Notes</h2>
            <Badge className="bg-amber-100 text-amber-700 text-xs">{dailyNotes.length}</Badge>
          </div>

          {dailyNotes.length === 0 ? (
            <Card className="surface-card">
              <CardContent className="py-8 text-center text-sm" style={{ color: "var(--text-quiet)" }}>
                No daily notes yet
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {dailyNotes.map((note) => (
                <Card
                  key={note.id}
                  className={`surface-card-hover cursor-pointer ${selectedNote?.id === note.id ? "ring-2 ring-[var(--accent)]" : ""}`}
                  onClick={() => { setSelectedNote(note); setSelectedEntry(null); }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{note.date}</span>
                      <Badge variant="outline" className="text-[10px]">{note.events_reviewed} events</Badge>
                    </div>
                    <p className="text-xs line-clamp-2" style={{ color: "var(--text-muted)" }}>{note.summary}</p>
                    {note.decisions.length > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: "var(--accent)" }}>{note.decisions.length} decision{note.decisions.length !== 1 ? "s" : ""}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Detail panel */}
      {(selectedEntry || selectedNote) && (
        <Card className="surface-card">
          <CardContent className="p-5">
            {selectedEntry && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{selectedEntry.title}</h3>
                  <Badge variant="outline">{selectedEntry.category}</Badge>
                </div>
                <pre className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {selectedEntry.content}
                </pre>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  {selectedEntry.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                  <span className="text-xs ml-auto" style={{ color: "var(--text-quiet)" }}>
                    {selectedEntry.source} · {timeAgo(selectedEntry.updated_at)}
                  </span>
                </div>
              </div>
            )}
            {selectedNote && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>{selectedNote.date}</h3>
                  <Badge variant="outline">{selectedNote.events_reviewed} events reviewed</Badge>
                </div>
                <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{selectedNote.summary}</p>

                {selectedNote.decisions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>Decisions</p>
                    {selectedNote.decisions.map((d, i) => (
                      <p key={i} className="text-sm" style={{ color: "var(--text-muted)" }}>• {d}</p>
                    ))}
                  </div>
                )}

                {selectedNote.blockers.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--danger)" }}>Blockers</p>
                    {selectedNote.blockers.map((b, i) => (
                      <p key={i} className="text-sm" style={{ color: "var(--danger)" }}>• {b}</p>
                    ))}
                  </div>
                )}

                {selectedNote.priorities_tomorrow.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--warning)" }}>Tomorrow's Priorities</p>
                    {selectedNote.priorities_tomorrow.map((p, i) => (
                      <p key={i} className="text-sm" style={{ color: "var(--text-muted)" }}>• {p}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
