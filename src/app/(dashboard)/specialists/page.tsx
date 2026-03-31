"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Zap,
  CheckCircle2,
  Clock,
  Users,
  TrendingUp,
  ArrowRight,
  XCircle,
  Star,
} from "lucide-react";
import {
  getSpecialists,
  getSpecialistTypes,
  getPromotionRecommendations,
  spawnSpecialist,
  completeSpecialist,
  terminateSpecialist,
} from "@/lib/data/departments";
import { getDepartments } from "@/lib/data/departments";
import { getAgents } from "@/lib/data/agents";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtime } from "@/lib/realtime/use-realtime";
import type { Specialist, SpecialistType, Department, Agent } from "@/types/dashboard";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PROMOTION_THRESHOLD = 3;

export default function SpecialistsPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [specialistTypes, setSpecialistTypes] = useState<SpecialistType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [promotions, setPromotions] = useState<ReturnType<typeof getPromotionRecommendations>>([]);

  // Spawn dialog
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [spawnType, setSpawnType] = useState("");
  const [spawnMission, setSpawnMission] = useState("");
  const [spawning, setSpawning] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [specResult, typesResult, deptResult, agentsResult] = await Promise.all([
        getSpecialists(),
        getSpecialistTypes(),
        getDepartments(),
        getAgents(),
      ]);
      setSpecialists(specResult.data);
      setSpecialistTypes(typesResult.data);
      setDepartments(deptResult.data);
      setAgents(agentsResult.data);
      setPromotions(getPromotionRecommendations(typesResult.data, agentsResult.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtime("feed_events", loadRef);

  useEffect(() => {
    load();
  }, []);

  async function handleSpawn() {
    if (!spawnType || !spawnMission.trim()) return;
    setSpawning(true);
    const typeData = specialistTypes.find((t) => t.name === spawnType);
    const dept = departments.find((d) => d.name === typeData?.category);
    await spawnSpecialist({
      name: `${spawnType} #${specialists.filter((s) => s.type === spawnType).length + 1}`,
      type: spawnType,
      mission: spawnMission.trim(),
      departmentId: dept?.id,
      spawnSource: "manual — CEO request",
    });
    setSpawnOpen(false);
    setSpawnType("");
    setSpawnMission("");
    setSpawning(false);
    await load();
  }

  const activeSpecialists = specialists.filter((s) => s.status === "active");
  const completedSpecialists = specialists.filter((s) => s.status !== "active");

  if (loading) {
    return (
      <PageShell title="Specialists" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading specialists...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Specialists" description="Temporary expert roles for specific missions">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-[rgba(245,158,11,0.08)]/50 px-4 py-2.5 text-xs text-[var(--warning)]">{error}</div>
      )}

      {/* Spawn button */}
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => setSpawnOpen(true)}>
            <Zap className="h-3.5 w-3.5" /> Spawn Specialist
          </Button>
        </div>
      )}

      {/* Active Specialists */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.08)]">
            <Zap className="h-4 w-4 text-[var(--success)]" />
          </div>
          <h2 className="section-title">Active Specialists</h2>
          {activeSpecialists.length > 0 && <Badge className="bg-[rgba(16,185,129,0.12)] text-[var(--success)] text-xs">{activeSpecialists.length}</Badge>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {activeSpecialists.length === 0 ? (
            <Card className="stat-card md:col-span-2">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">No active specialists</CardContent>
            </Card>
          ) : (
            activeSpecialists.map((spec) => (
              <Card key={spec.id} className="stat-card border-l-4 border-l-emerald-500">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{spec.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">{spec.type}</Badge>
                    </div>
                    <Badge className="bg-[rgba(16,185,129,0.12)] text-[var(--success)] text-xs">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{spec.mission}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Started {timeAgo(spec.started_at)}</span>
                    <span>·</span>
                    <span>{spec.spawn_source}</span>
                  </div>
                  {canWrite && (
                    <div className="flex gap-2 pt-2 border-t">
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={async () => {
                        const summary = prompt("Output summary:");
                        if (summary) { await completeSpecialist(spec.id, summary); await load(); }
                      }}>
                        <CheckCircle2 className="h-3 w-3" /> Complete
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" onClick={async () => {
                        await terminateSpecialist(spec.id); await load();
                      }}>
                        <XCircle className="h-3 w-3" /> Terminate
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Promotion Recommendations */}
      {promotions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
              <Star className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <h2 className="section-title">Promote to Permanent Agent</h2>
            <Badge className="bg-[rgba(139,92,246,0.12)] text-[var(--accent)] text-xs">{promotions.length}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {promotions.map((rec) => (
              <Card key={rec.type.id} className="stat-card border-l-4 border-l-violet-500">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{rec.type.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-1">{rec.evidence.suggestedDept}</Badge>
                    </div>
                    <Badge className="bg-[rgba(139,92,246,0.12)] text-[var(--accent)] text-xs">{rec.evidence.spawns} spawns</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.reason}</p>
                  <Link href="/hiring">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                      Go to Hiring <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Specialist Types Registry */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.08)]">
            <Users className="h-4 w-4 text-[var(--info)]" />
          </div>
          <h2 className="section-title">Specialist Types</h2>
          <Badge className="bg-[rgba(59,130,246,0.12)] text-[var(--info)] text-xs">{specialistTypes.length}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {specialistTypes.map((st) => (
            <Card key={st.id} className="stat-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{st.name}</p>
                  <Badge variant="outline" className="text-[10px] shrink-0 ml-2">{st.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{st.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{st.spawn_count} spawns</span>
                  <span>·</span>
                  <span>{st.last_spawned ? timeAgo(st.last_spawned) : "never used"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Recently Completed */}
      {completedSpecialists.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <h2 className="section-title">Recently Completed</h2>
          </div>

          <div className="space-y-3">
            {completedSpecialists.map((spec) => (
              <Card key={spec.id} className="stat-card opacity-75">
                <CardContent className="flex items-center gap-4 py-4 px-5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{spec.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{spec.output_summary ?? spec.mission}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {spec.ended_at ? timeAgo(spec.ended_at) : ""}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Spawn Dialog */}
      {canWrite && (
        <Dialog open={spawnOpen} onOpenChange={setSpawnOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Spawn Specialist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Specialist Type</label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={spawnType}
                  onChange={(e) => setSpawnType(e.target.value)}
                >
                  <option value="">Select type...</option>
                  {specialistTypes.map((st) => (
                    <option key={st.id} value={st.name}>{st.name} ({st.category})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mission *</label>
                <textarea
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="What should this specialist accomplish?"
                  value={spawnMission}
                  onChange={(e) => setSpawnMission(e.target.value)}
                />
              </div>
              <Button onClick={handleSpawn} disabled={spawning || !spawnType || !spawnMission.trim()} className="w-full gap-2">
                {spawning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Spawn
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
