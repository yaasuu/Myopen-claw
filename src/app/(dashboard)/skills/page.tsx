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
  CheckCircle2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  XCircle,
  Plus,
  ChevronRight,
  Zap,
  TrendingUp,
  Award,
} from "lucide-react";
import {
  getSkills,
  getAgentSkills,
  getSkillRequests,
  createSkillRequest,
  approveSkillRequest,
  rejectSkillRequest,
  analyzeSkillGaps,
  scanSkillContent,
} from "@/lib/data/skills";
import { getAgents } from "@/lib/data/agents";
import { getTasks } from "@/lib/data/tasks";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type {
  Skill,
  AgentSkill,
  SkillRequest,
  SkillScanResult,
  Agent,
  TaskWithAgent,
} from "@/types/dashboard";

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
  pending: { icon: Clock, color: "text-gray-500", bg: "bg-gray-50", label: "Pending scan" },
  clean: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", label: "Clean" },
  suspicious: { icon: ShieldAlert, color: "text-amber-600", bg: "bg-amber-50", label: "Suspicious" },
  blocked: { icon: Shield, color: "text-red-600", bg: "bg-red-50", label: "Blocked" },
};

export default function SkillsPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([]);
  const [requests, setRequests] = useState<SkillRequest[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [gaps, setGaps] = useState<ReturnType<typeof analyzeSkillGaps>>([]);

  const [processing, setProcessing] = useState<string | null>(null);

  // Request dialog
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqAgentId, setReqAgentId] = useState("");
  const [reqSkillName, setReqSkillName] = useState("");
  const [reqReason, setReqReason] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [skillsR, agentSkillsR, requestsR, agentsR, tasksR] = await Promise.all([
        getSkills(),
        getAgentSkills(),
        getSkillRequests(),
        getAgents(),
        getTasks(),
      ]);
      setSkills(skillsR.data);
      setAgentSkills(agentSkillsR.data);
      setRequests(requestsR.data);
      setAgents(agentsR.data);
      setTasks(tasksR.data);
      setGaps(analyzeSkillGaps(tasksR.data, agentsR.data, agentSkillsR.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["skill_requests", "agent_skills", "skills"], loadRef);

  useEffect(() => {
    load();
  }, []);

  async function handleApprove(requestId: string) {
    setProcessing(requestId);
    const result = await approveSkillRequest(requestId, "CEO");
    if (result.error) setError(result.error);
    await load();
    setProcessing(null);
  }

  async function handleReject(requestId: string) {
    setProcessing(requestId);
    await rejectSkillRequest(requestId, "CEO");
    await load();
    setProcessing(null);
  }

  async function handleRequest() {
    if (!reqAgentId || !reqSkillName.trim() || !reqReason.trim()) return;
    setProcessing("creating");
    const result = await createSkillRequest({
      agentId: reqAgentId,
      skillName: reqSkillName.trim(),
      reason: reqReason.trim(),
    });
    if (result.error) setError(result.error);
    setRequestOpen(false);
    setReqAgentId("");
    setReqSkillName("");
    setReqReason("");
    setProcessing(null);
    await load();
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const installedSkills = skills;

  if (loading) {
    return (
      <PageShell title="Skills" description="Loading...">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading skills...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Skills" description="Agent capability registry and learning system">
      {error && (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-700">{error}</div>
      )}

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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
            <Zap className="h-4 w-4 text-violet-600" />
          </div>
          <h2 className="section-title">Skill Requests</h2>
          {pendingRequests.length > 0 && <Badge className="bg-violet-100 text-violet-700 text-xs">{pendingRequests.length}</Badge>}
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
              const scan = scanStyles[req.scan_result];
              const ScanIcon = scan.icon;

              return (
                <Card key={req.id} className={`stat-card border-l-4 ${
                  req.scan_result === "blocked" ? "border-l-red-500" :
                  req.scan_result === "suspicious" ? "border-l-amber-500" :
                  req.scan_result === "clean" ? "border-l-emerald-500" :
                  "border-l-gray-300"
                }`}>
                  <CardContent className="p-5 space-y-4">
                    {/* Header */}
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
                        req.urgency === "high" ? "bg-red-100 text-red-700" :
                        req.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{req.urgency}</Badge>
                    </div>

                    {/* Reason */}
                    <p className="text-sm text-muted-foreground">{req.reason}</p>

                    {/* Security scan result */}
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${scan.bg}`}>
                      <ScanIcon className={`h-4 w-4 ${scan.color}`} />
                      <div>
                        <p className={`text-xs font-medium ${scan.color}`}>{scan.label}</p>
                        {req.scan_notes && <p className="text-[10px] text-muted-foreground mt-0.5">{req.scan_notes}</p>}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Requested {timeAgo(req.requested_at)}</span>
                      {req.evidence_task_ids.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{req.evidence_task_ids.length} evidence task{req.evidence_task_ids.length > 1 ? "s" : ""}</span>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    {canWrite && req.scan_result !== "blocked" && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          className="gap-1.5 flex-1"
                          disabled={processing === req.id}
                          onClick={() => handleApprove(req.id)}
                        >
                          {processing === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 flex-1"
                          disabled={processing === req.id}
                          onClick={() => handleReject(req.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                    {req.scan_result === "blocked" && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-red-600 font-medium">⛔ Auto-blocked — cannot be approved</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Skill Gap Analysis */}
      {gaps.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </div>
            <h2 className="section-title">Skill Gaps Detected</h2>
            <Badge className="bg-amber-100 text-amber-700 text-xs">{gaps.length}</Badge>
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
                      gap.urgency === "high" ? "bg-red-100 text-red-700" :
                      gap.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-blue-100 text-blue-700"
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

      {/* Agent Skill Registry */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">
            <Award className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="section-title">Agent Skills</h2>
          <Badge className="bg-blue-100 text-blue-700 text-xs">{agentSkills.length} installed</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const aSkills = agentSkills.filter((s) => s.agent_id === agent.id);
            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="stat-card hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{agent.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground">{aSkills.length} skill{aSkills.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    {aSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {aSkills.map((s) => (
                          <Badge key={s.skill_name} variant="outline" className="text-[10px]">
                            {s.skill_name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No skills installed</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Installed Skills */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <h2 className="section-title">Installed Skills</h2>
          <Badge className="bg-emerald-100 text-emerald-700 text-xs">{installedSkills.length}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {installedSkills.map((skill) => (
            <Card key={skill.id} className="stat-card">
              <CardContent className="p-4 space-y-1.5">
                <p className="text-sm font-medium">{skill.name}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{skill.source}</Badge>
                  {skill.category && <Badge variant="outline" className="text-[10px]">{skill.category}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Request Dialog */}
      {canWrite && (
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Skill</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Agent</label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={reqAgentId}
                  onChange={(e) => setReqAgentId(e.target.value)}
                >
                  <option value="">Select agent...</option>
                  {agents.filter((a) => a.status === "active").map((a) => (
                    <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Skill Name (from ClawHub)</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="e.g., github, notion, trello"
                  value={reqSkillName}
                  onChange={(e) => setReqSkillName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reason *</label>
                <textarea
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Why does this agent need this skill?"
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                🔒 The skill will be automatically scanned for security before approval.
              </p>
              <Button onClick={handleRequest} disabled={processing === "creating" || !reqAgentId || !reqSkillName.trim() || !reqReason.trim()} className="w-full gap-2">
                {processing === "creating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Submit Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
