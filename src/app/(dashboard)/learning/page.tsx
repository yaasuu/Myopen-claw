"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { 
  getDailySyncs, 
  getSkillRequests, 
  getLessons, 
  getSystemUpdates,
  approveSkillRequest,
  rejectSkillRequest,
  requestSkill,
  type MeetingSummary, 
  type SkillRequest,
  type Lesson,
  type SystemUpdate
} from "@/lib/data/learning";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";

export default function LearningHubPage() {
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [skillRequests, setSkillRequests] = useState<SkillRequest[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [updates, setUpdates] = useState<SystemUpdate[]>([]);
  const [lessonFilter, setLessonFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const [meetingsR, skillsR, lessonsR, updatesR] = await Promise.all([
      getDailySyncs(7),
      getSkillRequests(),
      getLessons(lessonFilter === "all" ? undefined : lessonFilter),
      getSystemUpdates(),
    ]);
    setMeetings(meetingsR);
    setSkillRequests(skillsR);
    setLessons(lessonsR);
    setUpdates(updatesR);
    setLoading(false);
  }

  const loadRef = useCallback(() => load(), [lessonFilter]);
  useRealtimeMulti(["daily_notes", "skill_requests", "lessons", "system_updates"], loadRef);

  useEffect(() => {
    load();
  }, [lessonFilter]);

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

  // Derived Stats
  const pendingApprovals = skillRequests.filter(s => s.status === "pending").length;
  const installedSkills = skillRequests.filter(s => s.status === "installed").length;

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="stat-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(245,158,11,0.12)]"><AlertTriangle className="h-5 w-5 text-[var(--warning)]" /></div>
            <div><div className="text-lg font-bold">{meetings.reduce((acc, m) => acc + m.difficulties.length, 0)}</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Open Findings</div></div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(59,130,246,0.12)]"><Lightbulb className="h-5 w-5 text-[var(--info)]" /></div>
            <div><div className="text-lg font-bold">0</div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Draft Lessons</div></div>
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

      {/* Main Tab Structure */}
      <Tabs defaultValue="meeting" className="space-y-6">
        <TabsList className="h-11 bg-background/50 border border-border/50">
          <TabsTrigger value="meeting" className="data-[state=active]:bg-background">Meeting</TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-background">Approvals</TabsTrigger>
          <TabsTrigger value="lessons" className="data-[state=active]:bg-background">Lessons</TabsTrigger>
          <TabsTrigger value="skills" className="data-[state=active]:bg-background">Skills</TabsTrigger>
          <TabsTrigger value="updates" className="data-[state=active]:bg-background">Updates</TabsTrigger>
        </TabsList>

        {/* TAB 1 — MEETING */}
        <TabsContent value="meeting" className="space-y-4">
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

                  {/* A. Executive Summary */}
                  <div className="rounded-md bg-muted/30 p-3 border border-border/50">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">A. Executive Summary</h4>
                    <p className="text-sm text-foreground/90 leading-relaxed">{day.summary}</p>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {/* B. Agent Updates */}
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
                      {/* C. Cross-Team Coordination */}
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
                      {/* D. Wins & Difficulties */}
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
                      {/* E. Next-Day Priorities */}
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
        </TabsContent>

        {/* TAB 2 — APPROVALS */}
        <TabsContent value="approvals" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold">Pending Approvals</h3>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRequestSkill}>
              <Plus className="h-3 w-3 mr-1" /> Request Skill
            </Button>
          </div>
          <div className="space-y-3">
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
                    <Button size="sm" className="h-7 text-xs bg-[var(--success)] hover:bg-[var(--success)]/90" onClick={() => handleApprove(req.id)}>Approve</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {skillRequests.every(s => s.status !== "pending") && (
              <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">All caught up! No pending approvals.</CardContent></Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 3 — LESSONS */}
        <TabsContent value="lessons" className="space-y-4">
          <div className="flex gap-2 mb-4">
            {["all", "draft", "pending", "approved", "applied"].map(f => (
              <Button key={f} size="sm" variant={lessonFilter === f ? "default" : "outline"} className="h-7 text-xs" onClick={() => setLessonFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          <div className="space-y-3">
            {lessons.length === 0 ? (
              <Card className="stat-card"><CardContent className="py-8 text-center text-muted-foreground">No lessons logged yet. The system is monitoring for patterns.</CardContent></Card>
            ) : (
              lessons.map(lesson => (
                <Card key={lesson.id} className="stat-card">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{lesson.title}</h3>
                      <Badge variant={lesson.status === "applied" ? "default" : lesson.status === "pending" ? "outline" : "secondary"} className="text-[10px] capitalize">{lesson.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{lesson.lesson_statement}</p>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                      <span className="bg-muted px-2 py-0.5 rounded">Pattern: {lesson.pattern}</span>
                      <span className="bg-muted px-2 py-0.5 rounded">Detected: {new Date(lesson.date_detected).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* TAB 4 — SKILLS */}
        <TabsContent value="skills" className="space-y-6">
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
        </TabsContent>

        {/* TAB 5 — UPDATES */}
        <TabsContent value="updates" className="space-y-4">
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
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
