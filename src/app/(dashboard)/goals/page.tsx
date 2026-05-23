"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Target, Plus, Loader2, X, Calendar, User } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

interface Goal {
  id: string;
  title: string;
  status: string;
  priority: string;
  parent_goal_id: string | null;
  due_date: string | null;
  description?: string | null;
  owner?: string | null;
  progress?: number | null;
  notes?: string | null;
  children?: Goal[];
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "rgba(16,185,129,0.1)",  color: "var(--success)" },
  completed: { bg: "rgba(37,99,235,0.1)",   color: "var(--info)" },
  paused:    { bg: "rgba(245,158,11,0.1)",  color: "var(--warning)" },
  cancelled: { bg: "rgba(220,38,38,0.1)",   color: "var(--danger)" },
};

function GoalNode({
  goal,
  onSelect,
  depth = 0,
}: {
  goal: Goal;
  onSelect: (goal: Goal) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = goal.children && goal.children.length > 0;
  const ss = STATUS_STYLE[goal.status] ?? { bg: "rgba(148,163,184,0.1)", color: "var(--text-quiet)" };

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--surface-muted)]"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(goal)}
      >
        <span
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setExpanded(!expanded);
            }
          }}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
            ) : (
              <ChevronRight className="h-4 w-4" style={{ color: "var(--text-quiet)" }} />
            )
          ) : (
            <div className="w-4" />
          )}
        </span>
        <Target className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <span className="text-sm font-medium flex-1 truncate" style={{ color: "var(--text)" }}>
          {goal.title}
        </span>
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{ background: ss.bg, color: ss.color, borderColor: "transparent" }}
        >
          {goal.status}
        </Badge>
        {goal.due_date && (
          <span className="text-[10px]" style={{ color: "var(--text-quiet)" }}>
            {new Date(goal.due_date).toLocaleDateString()}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="border-l ml-4 pl-2" style={{ borderColor: "var(--border)" }}>
          {goal.children!.map((child) => (
            <GoalNode key={child.id} goal={child} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  async function loadGoals() {
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from("goals")
        .select("id, title, status, priority, parent_goal_id, due_date, description, owner, progress, notes")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const goalMap = new Map<string, Goal>();
      const roots: Goal[] = [];

      (data || []).forEach((g) => goalMap.set(g.id, { ...g, children: [] }));
      (data || []).forEach((g) => {
        const goal = goalMap.get(g.id)!;
        if (g.parent_goal_id && goalMap.has(g.parent_goal_id)) {
          goalMap.get(g.parent_goal_id)!.children!.push(goal);
        } else {
          roots.push(goal);
        }
      });

      setGoals(roots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGoals();
  }, []);

  const ss = selectedGoal
    ? STATUS_STYLE[selectedGoal.status] ?? { bg: "rgba(148,163,184,0.1)", color: "var(--text-quiet)" }
    : null;

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-black tracking-tight flex items-center gap-2"
            style={{ color: "var(--text)" }}
          >
            <Target className="h-6 w-6" style={{ color: "var(--accent)" }} />
            Goals
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-quiet)" }}>
            Strategic hierarchy · execution targets · mission tree
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Goal
        </Button>
      </div>

      <div className="flex gap-4 items-start">
        {/* ── Tree ── */}
        <Card className={`transition-all duration-300 ${selectedGoal ? "flex-1 min-w-0" : "w-full"}`}>
          <CardContent className="p-4 min-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center h-40" style={{ color: "var(--text-quiet)" }}>
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading goals...
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
                  Failed to load goals
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-quiet)" }}>
                  {error}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadGoals();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : goals.length === 0 ? (
              <div className="text-center py-12" style={{ color: "var(--text-quiet)" }}>
                <p className="mb-2">No goals found.</p>
                <p className="text-sm">Start by creating a top-level mission.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {goals.map((goal) => (
                  <GoalNode key={goal.id} goal={goal} onSelect={setSelectedGoal} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Detail side panel ── */}
        {selectedGoal && ss && (
          <div
            className="w-80 shrink-0 rounded-xl border p-5 flex flex-col gap-4"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Target className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                <h2 className="text-sm font-bold leading-snug" style={{ color: "var(--text)" }}>
                  {selectedGoal.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedGoal(null)}
                className="rounded p-1 hover:bg-[var(--surface-muted)] shrink-0"
              >
                <X className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
              </button>
            </div>

            {/* Status + priority */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px]"
                style={{ background: ss.bg, color: ss.color, borderColor: "transparent" }}
              >
                {selectedGoal.status}
              </Badge>
              <Badge variant="outline" className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {selectedGoal.priority} priority
              </Badge>
            </div>

            {/* Progress bar */}
            {selectedGoal.progress != null && (
              <div>
                <div
                  className="flex justify-between text-[10px] mb-1"
                  style={{ color: "var(--text-quiet)" }}
                >
                  <span>Progress</span>
                  <span>{selectedGoal.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--surface-muted)" }}>
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${selectedGoal.progress}%`, background: "var(--accent)" }}
                  />
                </div>
              </div>
            )}

            {/* Description */}
            {selectedGoal.description && (
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {selectedGoal.description}
              </p>
            )}

            {/* Meta */}
            <div className="space-y-2">
              {selectedGoal.owner && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <User className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
                  {selectedGoal.owner}
                </div>
              )}
              {selectedGoal.due_date && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <Calendar className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
                  Due {new Date(selectedGoal.due_date).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Notes */}
            {selectedGoal.notes && (
              <div
                className="rounded-lg p-3 text-xs leading-relaxed"
                style={{ background: "var(--surface-muted)", color: "var(--text-muted)" }}
              >
                {selectedGoal.notes}
              </div>
            )}

            {/* Sub-goals */}
            {selectedGoal.children && selectedGoal.children.length > 0 && (
              <div>
                <p
                  className="text-[10px] font-semibold uppercase mb-2"
                  style={{ color: "var(--text-quiet)" }}
                >
                  Sub-goals ({selectedGoal.children.length})
                </p>
                <div className="space-y-1">
                  {selectedGoal.children.map((child) => {
                    const cs =
                      STATUS_STYLE[child.status] ?? {
                        bg: "rgba(148,163,184,0.1)",
                        color: "var(--text-quiet)",
                      };
                    return (
                      <div
                        key={child.id}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-[var(--surface-muted)]"
                        onClick={() => setSelectedGoal(child)}
                      >
                        <Target className="h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />
                        <span
                          className="text-xs flex-1 truncate"
                          style={{ color: "var(--text)" }}
                        >
                          {child.title}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: cs.bg, color: cs.color }}
                        >
                          {child.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
