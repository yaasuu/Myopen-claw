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
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Bot,
  ArrowRight,
} from "lucide-react";
import { getTasks } from "@/lib/data/tasks";
import { getTaskReviews, submitReview } from "@/lib/data/reviews";
import { useCanWrite } from "@/lib/auth/use-can-write";
import { useRealtimeMulti } from "@/lib/realtime/use-realtime";
import type { TaskWithAgent, TaskReview } from "@/types/dashboard";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ReviewsPage() {
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskWithAgent[]>([]);
  const [reviews, setReviews] = useState<Record<string, TaskReview[]>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getTasks();
      setTasks(result.data);
      if (result.error) setError(result.error);

      // Load reviews for in-review tasks
      const inReviewTasks = result.data.filter((t) => t.status === "in-review");
      const reviewResults = await Promise.all(
        inReviewTasks.map((t) => getTaskReviews(t.id))
      );
      const reviewsMap: Record<string, TaskReview[]> = {};
      inReviewTasks.forEach((t, i) => {
        reviewsMap[t.id] = reviewResults[i].data;
      });
      setReviews(reviewsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const loadRef = useCallback(() => load(), []);
  useRealtimeMulti(["tasks", "task_reviews"], loadRef);

  useEffect(() => { load(); }, []);

  async function handleReview(taskId: string, outcome: "approved" | "rejected" | "returned_for_rework") {
    const notes = prompt(outcome === "approved" ? "Approval notes (optional):" : "Reason:");
    if (notes === null) return;
    setProcessing(taskId);
    await submitReview(taskId, outcome, notes);
    setProcessing(null);
    await load();
  }

  const inReview = tasks.filter((t) => t.status === "in-review");
  const recentlyCompleted = tasks.filter((t) => t.status === "done").slice(0, 5);

  if (loading) {
    return (
      <PageShell title="Reviews" description="Loading...">
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews...
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Reviews" description="CEO review surface — approve, reject, or return work">
      {error && (
        <div className="rounded-lg border px-4 py-2.5 text-xs" style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.06)", color: "var(--warning)" }}>{error}</div>
      )}

      {/* Awaiting Review */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="icon-box-sm" style={{ background: "rgba(139,92,246,0.08)" }}>
            <Clock className="h-4 w-4 text-violet-500" />
          </div>
          <h2 className="section-title">Awaiting Review</h2>
          {inReview.length > 0 && (
            <Badge className="bg-violet-100 text-violet-700 text-xs">{inReview.length}</Badge>
          )}
        </div>

        {inReview.length === 0 ? (
          <Card className="surface-card">
            <CardContent className="flex items-center gap-3 py-8 px-5">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">All clear</p>
                <p className="text-xs" style={{ color: "var(--text-quiet)" }}>No tasks awaiting review</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {inReview.map((task) => (
              <Card key={task.id} className="surface-card border-l-4 border-l-violet-500">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{task.title}</p>
                      {task.description && (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-quiet)" }}>
                        {task.assigned_agent_name && (
                          <span>{task.assigned_agent_emoji} {task.assigned_agent_name}</span>
                        )}
                        <span>Submitted {timeAgo(task.updated_at)}</span>
                        <Badge className={`text-[10px] ${
                          task.priority === "high" ? "bg-red-100 text-red-700" :
                          task.priority === "medium" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{task.priority}</Badge>
                      </div>

                      {/* Review history for this task */}
                      {reviews[task.id]?.length > 0 && (
                        <div className="mt-2 p-2 rounded-lg" style={{ background: "var(--surface-muted)" }}>
                          {reviews[task.id].slice(0, 1).map((rv) => (
                            <div key={rv.id} className="flex items-center gap-2">
                              <Badge className={`text-[10px] ${
                                rv.outcome === "approved" ? "bg-emerald-100 text-emerald-700" :
                                rv.outcome === "rejected" ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>{rv.outcome.replace(/_/g, " ")}</Badge>
                              {rv.notes && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{rv.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Review actions */}
                    {canWrite && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={processing === task.id}
                          onClick={() => handleReview(task.id, "approved")}
                        >
                          {processing === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={processing === task.id}
                          onClick={() => handleReview(task.id, "returned_for_rework")}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Rework
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-[var(--danger)]"
                          disabled={processing === task.id}
                          onClick={() => handleReview(task.id, "rejected")}
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recently Completed */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="icon-box-sm" style={{ background: "rgba(16,185,129,0.08)" }}>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <h2 className="section-title">Recently Completed</h2>
        </div>

        {recentlyCompleted.length === 0 ? (
          <Card className="surface-card">
            <CardContent className="py-6 text-center text-sm" style={{ color: "var(--text-quiet)" }}>
              No completed tasks yet
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentlyCompleted.map((task) => (
              <div key={task.id} className="surface-card p-3 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: "var(--text)" }}>{task.title}</p>
                  <p className="text-xs" style={{ color: "var(--text-quiet)" }}>
                    {task.assigned_agent_emoji} {task.assigned_agent_name ?? "Unassigned"} · {timeAgo(task.updated_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
