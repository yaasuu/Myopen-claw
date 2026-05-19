"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  BookOpen,
  CheckCircle,
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
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  XCircle,
  TrendingUp,
  Award,
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
  getApprovals,
  resolveApproval,
  createApproval,
  type MeetingSummary,
  type AgentPerformance, 
  type Lesson,
  type SystemUpdate,
  type Approval,
  type ApprovalType,
  type ApprovalStatus,
  APPROVAL_LABELS
} from "@/lib/data/learning";
import {
  getSkills,
  getAgentSkills,
  analyzeSkillGaps,
  scanSkillContent,
  approveSkillRequest as approveSkillRequestFull,
  rejectSkillRequest as rejectSkillRequestFull,
  createSkillRequest as createSkillRequestFull,
} from "@/lib/data/skills";
import {
  getCapabilityGaps,
  getAuditRuns,
  reviewCapabilityGap,
} from "@/lib/data/capability-governance";
import type {
  Skill,
  AgentSkill,
  SkillRequest,
  SkillScanResult,
  CapabilityGap,
  CapabilityAuditRun,
  GapReviewStatus,
} from "@/types/dashboard";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import { EmptyState } from "@/components/ui/empty-state";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const scanStyles: Record<SkillScanResult, { icon: typeof Shield; color: string; bg: string; label: string }> = {
  pending: { icon: Clock, color: "text-[var(--text-quiet)]", bg: "bg-gray-50", label: "Pending scan" },
  clean: { icon: ShieldCheck, color: "text-[var(--success)]", bg: "bg-[rgba(16,185,129,0.08)]", label: "Clean" },
  suspicious: { icon: ShieldAlert, color: "text-[var(--warning)]", bg: "bg-[rgba(245,158,11,0.08)]", label: "Suspicious" },
  blocked: { icon: Shield, color: "text-[var(--danger)]", bg: "bg-[rgba(239,68,68,0.08)]", label: "Blocked" },
};

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
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("meeting");
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [skillRequests, setSkillRequests] = useState<SkillRequest[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [updates, setUpdates] = useState<SystemUpdate[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(false);
  const [agentPerf, setAgentPerf] = useState<AgentPerformance[]>([]);
  const [capGaps, setCapGaps] = useState<CapabilityGap[]>([]);
  const [auditRuns, setAuditRuns] = useState<CapabilityAuditRun[]>([]);
  const [scanMsg, setScanMsg] = useState<string>("");
  const [scanning, setScanning] = useState(false);

  // Skills tab state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [gaps, setGaps] = useState<ReturnType<typeof analyzeSkillGaps>>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqAgentId, setReqAgentId] = useState("");
  const [reqSkillName, setReqSkillName] = useState("");
  const [reqReason, setReqReason] = useState("");

  async function load() {
    setLoading(true);
    const [meetingsR, skillsReqR, lessonsR, updatesR, perfR, gapsR, auditsR, approvalsR, skillsListR, agentSkillsR, tasksR] = await Promise.all([
      getDailySyncs(7),
      getSkillRequests(),
      getLessons(lessonFilter === "all" ? undefined : lessonFilter),
      getSystemUpdates(),
      getAgentPerformance(),
      getCapabilityGaps(),
      getAuditRuns(),
      getApprovals("pending"),
      getSkills(),
      getAgentSkills(),
      getTasks(),
    ]);
    setMeetings(meetingsR);
    setSkillRequests(skillsReqR as unknown as SkillRequest[]);
    setLessons(lessonsR);
    setUpdates(updatesR);
    setAgentPerf(perfR);
    setCapGaps(gapsR.data);
    setAuditRuns(auditsR.data);
    setApprovals(approvalsR);
    setSkills(skillsListR.data);
    setAgentSkills(agentSkillsR.data);
    const agentsList = await getAgents();
    setGaps(analyzeSkillGaps(tasksR.data, agentsList.data, agentSkillsR.data));
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

  // Skills tab handlers
  async function handleSkillApprove(requestId: string) {
    setProcessing(requestId);
    const { error } = await approveSkillRequestFull(requestId, "Yas");
    if (error) console.error(error);
    await load();
    setProcessing(null);
  }

  async function handleSkillReject(requestId: string) {
    setProcessing(requestId);
    await rejectSkillRequestFull(requestId, "Yas");
    await load();
    setProcessing(null);
  }

  async function handleSkillRequest() {
    if (!reqAgentId || !reqSkillName.trim() || !reqReason.trim()) return;
    setProcessing("creating");
    const { error } = await createSkillRequestFull({
      agentId: reqAgentId,
      skillName: reqSkillName.trim(),
      reason: reqReason.trim(),
    });
    if (error) console.error(error);
    setRequestOpen(false);
    setReqAgentId("");
    setReqSkillName("");
    setReqReason("");
    setProcessing(null);
    await load();
  }

  const pendingRequests = skillRequests.filter((r) => r.status === "pending");

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

  async function handleResolveApproval(id: string, status: "approved" | "rejected" | "revision_requested") {
    const ok = await resolveApproval(id, status, "Yas");
    if (ok) {
      setApprovals((prev) => prev.filter((a) => a.id !== id));
      load();
    }
  }

  const pendingApprovals = skillRequests.filter(s => s.status === "pending").length + approvals.length;
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
              <EmptyState icon={Calendar} title="No daily syncs yet" message="Daily sync reports will appear here as the system runs." />
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
                <Badge variant="outline" className="text-[10px]">{approvals.length} typed + {skillRequests.filter(s => s.status === "pending").length} skill</Badge>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRequestSkill}>
                <Plus className="h-3 w-3 mr-1" /> Request Skill
              </Button>
            </div>

            {/* Typed approvals */}
            {approvals.map(a => (
              <Card key={a.id} className="stat-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[10px]">{APPROVAL_LABELS[a.approval_type]}</Badge>
                    <span className="text-[10px] text-muted-foreground">by {a.requested_by}</span>
                  </div>
                  <p className="text-sm font-medium">{a.description}</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleResolveApproval(a.id, "approved")}>✅ Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleResolveApproval(a.id, "revision_requested")}>↩ Rework</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-[var(--danger)]" onClick={() => handleResolveApproval(a.id, "rejected")}>✕ Reject</Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Pending skill requests */}
            {skillRequests.filter(s => s.status === "pending").map(req => (
              <Card key={req.id} className="stat-card">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{req.agent_name ? `${req.agent_name} Skill` : "System Skill"}</Badge>
                      <span className="text-sm font-medium">{req.skill_name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{req.skill_description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Requested {timeAgo(req.requested_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-[var(--danger)]" onClick={() => handleReject(req.id)}>Reject</Button>
                    <Button size="sm" className="h-7 text-xs bg-[var(--success)] hover:bg-[var(--success)]/90 text-background" onClick={() => handleApprove(req.id)}>Approve</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {approvals.length === 0 && skillRequests.every((s: SkillRequest) => s.status !== "pending") && (
              <EmptyState icon={CheckCircle} title="All caught up" message="No pending approvals right now." />
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
              <EmptyState icon={BookOpen} title="No lessons yet" message="Lessons are auto-generated when recurring patterns are detected." action={{ label: "Scan Now", onClick: handleScanLessons }} />
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
            {/* Request button */}
            {canWrite && (
              <div className="flex justify-end">
                <Button size="sm" className="gap-1.5" onClick={() => setRequestOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Request Skill
                </Button>
              </div>
            )}

            {/* Pending Requests + Security Scan */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.08)]">
                  <Zap className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <h2 className="section-title">Skill Requests</h2>
                {pendingRequests.length > 0 && <Badge className="bg-[rgba(139,92,246,0.12)] text-[var(--accent)] text-xs">{pendingRequests.length}</Badge>}
              </div>

              {pendingRequests.length === 0 ? (
                <Card className="stat-card">
                  <CardContent className="flex items-center gap-3 py-6 px-5">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium">No pending requests</p>
                      <p className="text-xs text-muted-foreground">All skill requests have been reviewed</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {pendingRequests.map((req) => {
                    const scan = scanStyles[req.scan_result]
                    const ScanIcon = scan.icon

                    return (
                      <Card key={req.id} className={`stat-card border-l-4 ${
                        req.scan_result === "blocked" ? "border-l-red-500" :
                        req.scan_result === "suspicious" ? "border-l-amber-500" :
                        req.scan_result === "clean" ? "border-l-emerald-500" :
                        "border-l-gray-300"
                      }`}>
                        <CardContent className="p-5 space-y-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold">{req.skill_name}</span>
                                <Badge variant="outline" className="text-[10px]">{req.skill_source}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{req.agent_emoji}</span>
                                <span className="text-xs text-muted-foreground">{req.agent_name}</span>
                              </div>
                            </div>
                            <Badge className={`text-xs ${
                              req.urgency === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                              req.urgency === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                              "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                            }`}>{req.urgency}</Badge>
                          </div>

                          <p className="text-sm text-muted-foreground">{req.reason}</p>

                          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${scan.bg}`}>
                            <ScanIcon className={`h-4 w-4 ${scan.color}`} />
                            <div>
                              <p className={`text-xs font-medium ${scan.color}`}>{scan.label}</p>
                              {req.scan_notes && <p className="text-[10px] text-muted-foreground mt-0.5">{req.scan_notes}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Requested {timeAgo(req.requested_at)}</span>
                            {req.evidence_task_ids.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{req.evidence_task_ids.length} evidence task{req.evidence_task_ids.length > 1 ? "s" : ""}</span>
                              </>
                            )}
                          </div>

                          {canWrite && req.scan_result !== "blocked" && (
                            <div className="flex gap-2 pt-2 border-t">
                              <Button size="sm" className="gap-1.5 flex-1" disabled={processing === req.id} onClick={() => handleSkillApprove(req.id)}>
                                {processing === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1.5 flex-1" disabled={processing === req.id} onClick={() => handleSkillReject(req.id)}>
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </div>
                          )}
                          {req.scan_result === "blocked" && (
                            <div className="pt-2 border-t">
                              <p className="text-xs text-[var(--danger)] font-medium">⛔ Auto-blocked — cannot be approved</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Skill Gap Analysis */}
            {gaps.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(245,158,11,0.08)]">
                    <TrendingUp className="h-4 w-4 text-[var(--warning)]" />
                  </div>
                  <h2 className="section-title">Skill Gaps Detected</h2>
                  <Badge className="bg-[rgba(245,158,11,0.12)] text-[var(--warning)] text-xs">{gaps.length}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {gaps.map((gap, i) => (
                    <Card key={i} className="stat-card border-l-2 border-l-amber-400">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{gap.agent.emoji}</span>
                            <span className="text-sm font-medium">{gap.agent.name}</span>
                          </div>
                          <Badge className={`text-[10px] ${
                            gap.urgency === "high" ? "bg-[rgba(239,68,68,0.12)] text-[var(--danger)]" :
                            gap.urgency === "medium" ? "bg-[rgba(245,158,11,0.12)] text-[var(--warning)]" :
                            "bg-[rgba(59,130,246,0.12)] text-[var(--info)]"
                          }`}>{gap.urgency}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Missing: <span className="font-medium text-foreground">{gap.missingSkill}</span></p>
                        <p className="text-xs text-muted-foreground">{gap.reason}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Agent Skills */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(16,185,129,0.08)]">
                  <Award className="h-4 w-4 text-[var(--success)]" />
                </div>
                <h2 className="section-title">Agent Skills</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agentSkills.map((as) => (
                  <Card key={as.id} className="stat-card">
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-lg">{as.agent_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{as.skill_name}</p>
                        <p className="text-[10px] text-muted-foreground">{as.agent_name}</p>
                      </div>
                      <Badge variant="outline" className="text-[9px]">{as.month_installed}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Installed Skills */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.08)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--info)]" />
                </div>
                <h2 className="section-title">Installed Skills Registry</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {skills.filter(s => s.status === "active" || !s.status).map((skill) => (
                  <Card key={skill.id} className="stat-card">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">{skill.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
                        </div>
                        <Badge variant="outline" className="bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20">Active</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ─── UPDATES ─── */}
        {activeTab === "updates" && (
          <div className="space-y-4">
            {updates.length === 0 ? (
              <EmptyState icon={Zap} title="No updates yet" message="Applied improvements will appear here." />
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
