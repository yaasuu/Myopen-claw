"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Zap,
  RefreshCw,
  Calendar,
  ChevronRight,
  Lightbulb,
  Plus,
  Search,
  Filter,
  Target,
  BarChart3,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Activity,
} from "lucide-react";
import { 
  getDailySyncs,
  getAgentPerformance,
  getSkillRequests, 
  getLessons, 
  getSystemUpdates,
  approveSkillRequest,
  rejectSkillRequest,
  requestSkill,
  updateLessonStatus,
  type MeetingSummary,
  type AgentPerformance, 
  type SkillRequest,
  type Lesson,
  type SystemUpdate
} from "@/lib/data/learning";
import {
  getCapabilityGaps,
  getAuditRuns,
  reviewCapabilityGap,
} from "@/lib/data/capability-governance";
import type {
  CapabilityGap,
  CapabilityAuditRun,
  GapReviewStatus,
} from "@/types/dashboard";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";

const TABS = [
  { key: "meeting", label: "Meeting", sub: "Daily sync reports", Icon: Calendar, bg: "bg-blue-500/12", border: "border-blue-500/30", icon: "text-blue-400", text: "text-blue-300" },
  { key: "approvals", label: "Approvals", sub: "Decision queue", Icon: CheckCircle2, bg: "bg-violet-500/12", border: "border-violet-500/30", icon: "text-violet-400", text: "text-violet-300" },
  { key: "lessons", label: "Lessons", sub: "Operational insights", Icon: BookOpen, bg: "bg-amber-500/12", border: "border-amber-500/30", icon: "text-amber-400", text: "text-amber-300" },
  { key: "skills", label: "Skills", sub: "Capabilities & requests", Icon: Lightbulb, bg: "bg-emerald-500/12", border: "border-emerald-500/30", icon: "text-emerald-400", text: "text-emerald-300" },
  { key: "updates", label: "Updates", sub: "Change history", Icon: Zap, bg: "bg-teal-500/12", border: "border-teal-500/30", icon: "text-teal-400", text: "text-teal-300" },
  { key: "governance", label: "Governance", sub: "Gaps & automation", Icon: Target, bg: "bg-rose-500/12", border: "border-rose-500/30", icon: "text-rose-400", text: "text-rose-300" },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function LearningHubPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("meeting");
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [skillRequests, setSkillRequests] = useState<SkillRequest[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [updates, setUpdates] = useState<SystemUpdate[]>([]);
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(false);
  const [agentPerf, setAgentPerf] = useState<AgentPerformance[]>([]);
  const [capGaps, setCapGaps] = useState<CapabilityGap[]>([]);
  const [auditRuns, setAuditRuns] = useState<CapabilityAuditRun[]>([]);
  const [scanMsg, setScanMsg] = useState<string>("");
  const [scanning, setScanning] = useState(false);

  async function load() {
    setLoading(true);
    const [meetingsR, skillsR, lessonsR, updatesR, perfR, gapsR, auditsR] = await Promise.all([
      getDailySyncs(7),
      getSkillRequests(),
      getLessons(lessonFilter === "all" ? undefined : lessonFilter),
      getSystemUpdates(),
      getAgentPerformance(),
      getCapabilityGaps(),
      getAuditRuns(),
    ]);
    setMeetings(meetingsR);
    setSkillRequests(skillsR);
    setLessons(lessonsR);
    setUpdates(updatesR);
    setAgentPerf(perfR);
    setCapGaps(gapsR.data);
    setAuditRuns(auditsR.data);
    setLoading(false);
  }

  const loadRef = useCallback(() => load(), [lessonFilter]);
  useRealtimeMulti(["daily_notes", "skill_requests", "lessons", "system_updates"], loadRef);

  useEffect(() => {
    load();
  }, [lessonFilter, activeTab]);

  async function handleApprove(id: string) {
    await approveSkillRequest(id);
    load();
  }

  async function handleReject(id: string) {
    await rejectSkillRequest(id);
    load();
  }

  async function handleRequestSkill() {
    const title = prompt("Skill Name:");
    if (!title) return;
    const description = prompt("Description/Reason:") || "";
    await requestSkill(title, description, "Yas");
    load();
  }

  async function handleScanLessons() {
    setScanning(true);
    setScanMsg("Scanning tasks and reviews for patterns...");
    try {
      const resp = await fetch(
        process.env.NEXT_PUBLIC_SUPABASE_URL ? `/api/orchestrator` : ``,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check_and_draft_lessons" }),
        }
      );
      const result = await resp.json();
      if (result.lessons_draft > 0) {
        setScanMsg(`✅ ${result.lessons_draft} new lesson(s) drafted.`);
      } else {
        setScanMsg("✅ No new recurring patterns found.");
      }
      load();
    } catch (e: any) {
      setScanMsg(`❌ Scan failed: ${e.message}`);
    }
    setScanning(false);
  }

  async function handleLessonStatus(id: string, status: Lesson["status"]) {
    const ok = await updateLessonStatus(id, status);
    if (ok) load();
  }

  async function handleReviewGap(gapId: string, status: GapReviewStatus) {
    await reviewCapabilityGap(gapId, status, "Yas");
    load();
  }

  const pendingApprovals = skillRequests.filter(s => s.status === "pending").length;
  const installedSkills = skillRequests.filter(s => s.status === "installed").length;

  const draftLessons = lessons.filter(l => l.status === "draft").length;
  const draftLessonsFromMeetings = meetings.reduce((acc, m) => (m.skill_gaps?.length || 0) + acc, 0);

  if (loading) {
    return (
      <PageShell title="Learning Hub" description="Loading operational intelligence...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Syncing system memory...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Learning Hub" description="Daily sync, findings, lessons, skills, and operational improvements">
      

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card className="stat-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(245,158,11,0.12)]"><AlertTriangle className="h-5 w-5 text-[var(--warning)]" /></div>
            <div><div className="text-lg font-bold">{meetings.reduce((acc, m) => acc + m.difficulties.length, 0)}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Open Findings</div></div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.12)]"><Lightbulb className="h-5 w-5 text-[var(--info)]" /></div>
            <div><div className="text-lg font-bold">{draftLessons + draftLessonsFromMeetings}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Draft Lessons</div></div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.12)]"><CheckCircle2 className="h-5 w-5 text-[var(--accent)]" /></div>
            <div><div className="text-lg font-bold">{pendingApprovals}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending Approvals</div></div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.12)]"><Zap className="h-5 w-5 text-[var(--success)]" /></div>
            <div><div className="text-lg font-bold">{installedSkills}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Installed Skills</div></div>
          </CardContent>
        </Card>
      </div>

      {/* Premium Segmented Tab Bar */}
      <div className="rounded-xl border border-border/60 bg-surface/60 backdrop-blur p-1.5 mb-6">
        <div className="flex gap-1">
          {TABS.map(({ key, label, sub, Icon, bg, border, icon, text }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key as TabKey)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-3 rounded-lg text-xs font-medium transition-all duration-150 ${
                  isActive ? `${bg} ${border} border shadow-sm` : "hover:bg-surface-muted/40"
                }`}
              >
                <Icon className={`h-4 w-4 transition-colors ${isActive ? icon : "text-muted-foreground/40"}`} />
                <span className={`transition-colors ${isActive ? text : "text-muted-foreground/60"}`}>{label}</span>
                <span className="text-[9px] text-muted-foreground/30 leading-none">{sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Utility Row */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 flex items-center gap-2 h-8 px-3 rounded-lg border border-border/50 bg-surface/40">
          <Search className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <input
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
            placeholder="Search across Learning Hub..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/50 bg-surface/40 text-xs text-muted-foreground/70 hover:bg-surface-muted/50 transition-colors">
          <Filter className="h-3 w-3" /> Filter
        </button>
        <button
          className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs transition-colors ${
            showUnresolvedOnly
              ? "border-[var(--warning)]/30 bg-[var(--warning)]/8 text-[var(--warning)]"
              : "border-border/50 bg-surface/40 text-muted-foreground/70 hover:bg-surface-muted/50"
          }`}
          onClick={() => setShowUnresolvedOnly(!showUnresolvedOnly)}
        >
          <AlertTriangle className="h-3 w-3" />
          Unresolved only
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">

        {/* ─── MEETING ─── */}
        {activeTab === "meeting" && (
          <div className="space-y-4">
            {meetings.length === 0 ? (
              <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">No daily syncs found yet.</CardContent></Card>
            ) : (
              meetings.map((day) => (
                <Card key={day.id} className={`stat-card ${day.health === "needs_attention" ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-emerald-500"}`}>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-foreground">Daily Sync — {day.date}</h3>
                      </div>
                      <Badge variant={day.health === "healthy" ? "default" : "outline"} className={day.health === "needs_attention" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : ""}>
                        {day.health === "healthy" ? "Healthy" : "Needs Attention"}
                      </Badge>
                    </div>

                    <div className="rounded-md bg-muted/30 p-3 border border-border/50">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">A. Executive Summary</h4>
                      <p className="text-sm text-foreground/90 leading-relaxed">{day.summary}</p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)] mb-2">B. Agent Updates</h4>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {day.agent_updates && day.agent_updates.map((agent: any, i: number) => (
                              <div key={i} className="rounded border bg-background/50 p-2 text-xs space-y-1">
                                <div className="flex items-center justify-between font-medium">
                                  <span>{agent.emoji} {agent.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{agent.utilization}</span>
                                </div>
                                <div className="text-muted-foreground text-[10px]">
                                  ✅ {agent.workload.completed} | 🚧 {agent.workload.in_progress} | ⚠️ {agent.workload.blocked}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)] mb-2">C. Coordination</h4>
                          {day.cross_team && day.cross_team.coordination_notes && day.cross_team.coordination_notes.length > 0 ? (
                            day.cross_team.coordination_notes.map((note: string, i: number) => (
                              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {note}</p>
                            ))
                          ) : <p className="text-xs text-muted-foreground/50">No coordination gaps.</p>}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--success)] mb-1">Wins & Successes</h4>
                          {day.wins.length > 0 ? day.wins.map((w, i) => (
                            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1"><CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> {w}</p>
                          )) : <p className="text-xs text-muted-foreground/50">No major wins recorded.</p>}
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--danger)] mb-1">Blockers & Difficulties</h4>
                          {day.difficulties.length > 0 ? day.difficulties.map((d, i) => (
                            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {d}</p>
                          )) : <p className="text-xs text-muted-foreground/50">No blockers reported.</p>}
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] mb-1">Tomorrow's Priorities</h4>
                          {day.assigned_actions.length > 0 ? day.assigned_actions.map((a, i) => (
                            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5 mb-1"><ChevronRight className="h-3 w-3 mt-0.5 shrink-0" /> {a}</p>
                          )) : <p className="text-xs text-muted-foreground/50">No actions assigned.</p>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {/* Agent Performance Section */}
            {agentPerf.length > 0 && (
              <Card className="stat-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-[var(--accent)]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">H. Agent Performance — All Time</h4>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[...agentPerf]
                      .sort((a, b) => b.total - a.total)
                      .map(agent => {
                        const hasBlockers = agent.blocked > 0 || agent.blockers.length > 0;
                        return (
                          <div key={agent.name} className={`rounded border p-3 text-xs ${hasBlockers ? "border-amber-500/30 bg-amber-500/3" : "border-border/50 bg-muted/20"}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">{agent.emoji}</span>
                              <span className="text-sm font-semibold truncate flex-1">{agent.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${agent.completionRate >= 50 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                                {agent.completionRate}%
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground">
                              <div className="rounded bg-muted/50 p-1">
                                <div className="text-sm font-bold text-[var(--success)]">{agent.completed}</div>
                                <div className="text-[8px] uppercase">Done</div>
                              </div>
                              <div className="rounded bg-muted/50 p-1">
                                <div className="text-sm font-bold text-[var(--info)]">{agent.inProgress + agent.inReview}</div>
                                <div className="text-[8px] uppercase">Active</div>
                              </div>
                              <div className="rounded bg-muted/50 p-1">
                                <div className={`text-sm font-bold ${agent.blocked > 0 ? "text-[var(--danger)]" : "text-muted-foreground"}`}>{agent.blocked}</div>
                                <div className="text-[8px] uppercase">Blocked</div>
                              </div>
                            </div>
                            {agent.blockers.length > 0 && (
                              <div className="mt-1.5 text-[10px] text-[var(--danger)]">
                                {agent.blockers.slice(0, 2).map((b, i) => (
                                  <div key={i} className="flex items-start gap-1">
                                    <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" /> {b}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── APPROVALS ─── */}
        {activeTab === "approvals" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="text-sm font-semibold">Pending Approvals</h3>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRequestSkill}>
                <Plus className="h-3 w-3 mr-1" /> Request Skill
              </Button>
            </div>
            {skillRequests.filter(s => s.status === "pending").map(req => (
              <Card key={req.id} className="stat-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{req.affected_agent ? `${req.affected_agent} Skill` : "System Skill"}</Badge>
                      <span className="text-sm font-medium">{req.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{req.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Requested by {req.requested_by}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-[var(--danger)]" onClick={() => handleReject(req.id)}>Reject</Button>
                    <Button size="sm" className="h-7 text-xs bg-[var(--success)] hover:bg-[var(--success)]/90 text-background" onClick={() => handleApprove(req.id)}>Approve</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {skillRequests.every(s => s.status !== "pending") && (
              <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">All caught up! No pending approvals.</CardContent></Card>
            )}
          </div>
        )}

        {/* ─── LESSONS ─── */}
        {activeTab === "lessons" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {["all", "draft", "pending", "approved", "applied"].map(f => (
                <Button key={f} size="sm" variant={lessonFilter === f ? "default" : "outline"} className="h-7 text-xs" onClick={() => setLessonFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" disabled={scanning} onClick={handleScanLessons}>
                {scanning ? "Scanning..." : "🔍 Scan Now"}
              </Button>
            </div>
            {scanMsg && (
              <div className="text-xs font-mono px-3 py-2 rounded-md" style={{
                background: scanMsg.startsWith("✅") ? "rgba(16,185,129,0.08)" : scanMsg.startsWith("❌") ? "rgba(239,68,68,0.08)" : "rgba(139,92,246,0.08)",
                color: scanMsg.startsWith("✅") ? "var(--success)" : scanMsg.startsWith("❌") ? "var(--danger)" : "var(--accent)",
              }}>{scanMsg}</div>
            )}
            {lessons.length === 0 ? (
              <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">No lessons logged yet. The system is monitoring for patterns.</CardContent></Card>
            ) : (
              lessons.map(lesson => (
                <Card key={lesson.id} className="stat-card">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-sm font-semibold flex-1">{lesson.title}</h3>
                      <Badge variant={lesson.status === "applied" ? "default" : lesson.status === "pending" ? "outline" : "secondary"} className="text-[10px] capitalize shrink-0">{lesson.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{lesson.lesson_statement}</p>
                    {lesson.proposed_fix && (
                      <div className="rounded-md bg-muted/30 p-2 mb-2 text-[11px] text-muted-foreground">
                        <span className="font-medium">Proposed fix:</span> {lesson.proposed_fix}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                        {lesson.affected_agents && lesson.affected_agents.length > 0 && (
                          <span className="bg-muted px-2 py-0.5 rounded">Agent{lesson.affected_agents.length > 1 ? "s" : ""}: {lesson.affected_agents.join(", ")}</span>
                        )}
                        <span className="bg-muted px-2 py-0.5 rounded">{new Date(lesson.date_detected).toLocaleDateString()}</span>
                      </div>
                      {/* Status progression buttons */}
                      <div className="flex gap-1">
                        {lesson.status === "draft" && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleLessonStatus(lesson.id, "pending")}>Promote → Pending</Button>
                        )}
                        {lesson.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleLessonStatus(lesson.id, "approved")}>✅ Approve</Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] text-[var(--danger)]" onClick={() => handleLessonStatus(lesson.id, "rejected")}>✕ Reject</Button>
                          </>
                        )}
                        {lesson.status === "approved" && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleLessonStatus(lesson.id, "applied")}>🚀 Mark Applied</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ─── SKILLS ─── */}
        {activeTab === "skills" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-3">Installed Skills</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {skillRequests.filter(s => s.status === "installed").map(skill => (
                  <Card key={skill.id} className="stat-card">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">{skill.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
                        </div>
                        <Badge variant="outline" className="bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">Active</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)] mb-3">Pending Requests</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {skillRequests.filter(s => s.status !== "installed").map(skill => (
                  <Card key={skill.id} className="stat-card border-dashed">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">{skill.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">Requested by {skill.requested_by}</p>
                        </div>
                        <Badge variant="outline" className="bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20">Pending</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── UPDATES ─── */}
        {activeTab === "updates" && (
          <div className="space-y-4">
            {updates.length === 0 ? (
              <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">No updates applied yet.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {updates.map(update => (
                  <Card key={update.id} className="stat-card border-l-4 border-l-[var(--success)]">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline" className="text-[10px] mb-2">{update.type.replace('_', ' ')}</Badge>
                          <h3 className="text-sm font-semibold">{update.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{update.description}</p>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(update.applied_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── GOVERNANCE ─── */}
        {activeTab === "governance" && (
          <div className="space-y-6">
            {/* Audit History */}
            {auditRuns.length > 0 && (
              <Card className="stat-card">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="h-4 w-4 text-[var(--accent)]" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Audit History</h4>
                  </div>
                  <div className="space-y-2">
                    {auditRuns.slice(0, 5).map((run: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-xs rounded-lg border border-border/50 p-3">
                        <Badge variant="outline" className="text-[10px]">{run.run_date || "Today"}</Badge>
                        <span className="flex-1 text-muted-foreground">{run.summary || "Audit completed"}</span>
                        <span className="text-[10px] text-muted-foreground">{run.gaps_detected || run.total_gaps_created || 0} gaps · {run.critical_gaps || 0} critical</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Capability Gaps */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-[var(--danger)]" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Capability Gaps</h4>
                {capGaps.length > 0 && (
                  <Badge className="bg-[rgba(239,68,68,0.12)] text-[var(--danger)] text-[10px]">
                    {capGaps.filter((g: any) => g.review_status === "pending").length} pending
                  </Badge>
                )}
              </div>

              {capGaps.length === 0 ? (
                <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">No capability gaps detected yet. The nightly audit runs at 23:00 UTC.</CardContent></Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {capGaps.map((gap: any) => {
                    const urgencyColors: Record<string, string> = {
                      high: "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]",
                      medium: "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]",
                      low: "bg-[rgba(59,130,246,0.12)] text-[var(--info)]",
                    };
                    const statusColors: Record<string, string> = {
                      pending: "border-l-amber-400",
                      approved: "border-l-emerald-500",
                      rejected: "border-l-red-500",
                      monitored: "border-l-blue-400",
                      resolved: "border-l-gray-300",
                    };
                    const categoryLabels: Record<string, string> = {
                      missing_skill: "Missing Skill",
                      wrong_assignment: "Wrong Assignment",
                      unclear_scope: "Unclear Scope",
                      dependency_blocker: "Dependency Blocker",
                      missing_process: "Missing Process",
                      approval_delay: "Approval Delay",
                    };

                    return (
                      <Card key={gap.id} className={`stat-card border-l-4 ${statusColors[gap.review_status] || "border-l-amber-400"}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold">{gap.missing_skill_name || gap.capability_area}</span>
                                <Badge variant="outline" className="text-[9px]">{categoryLabels[gap.gap_category] || gap.gap_category}</Badge>
                              </div>
                              {gap.agent_emoji && (
                                <span className="text-xs text-muted-foreground">{gap.agent_emoji} {gap.agent_name || "Unassigned"}</span>
                              )}
                            </div>
                            <Badge className={`text-[9px] ${urgencyColors[gap.urgency_level] || urgencyColors.medium}`}>
                              {gap.urgency_level}
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground">{gap.why_flagged}</p>

                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> {gap.evidence_count || 0} evidence</span>
                            {gap.confidence_level && <span>Confidence: {gap.confidence_level}</span>}
                          </div>

                          {gap.recommended_action && (
                            <div className="flex items-start gap-1.5 rounded-lg bg-[rgba(139,92,246,0.05)] px-2.5 py-1.5">
                              <ChevronRight className="h-3 w-3 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                              <p className="text-[10px]">{gap.recommended_action}</p>
                            </div>
                          )}

                          {gap.review_status !== "pending" && (
                            <Badge variant="outline" className="text-[9px]">
                              {gap.review_status === "monitored" && <Eye className="h-2.5 w-2.5 mr-0.5" />}
                              {gap.review_status === "approved" && <ThumbsUp className="h-2.5 w-2.5 mr-0.5" />}
                              {gap.review_status === "rejected" && <ThumbsDown className="h-2.5 w-2.5 mr-0.5" />}
                              {gap.review_status}
                            </Badge>
                          )}

                          {gap.review_status === "pending" && (
                            <div className="flex gap-1.5 pt-1.5 border-t border-border/50">
                              <Button size="sm" className="h-6 text-[10px] flex-1 gap-1" onClick={() => handleReviewGap(gap.id, "approved")}>
                                <ThumbsUp className="h-3 w-3" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] flex-1 gap-1" onClick={() => handleReviewGap(gap.id, "rejected")}>
                                <ThumbsDown className="h-3 w-3" /> Reject
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => handleReviewGap(gap.id, "monitored")}>
                                <Eye className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
