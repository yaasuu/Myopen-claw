"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/dashboard/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Target, Plus, Loader2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

interface Goal {
  id: string;
  title: string;
  status: string;
  priority: string;
  parent_goal_id: string | null;
  due_date: string | null;
  children?: Goal[];
}

function GoalNode({ goal, depth = 0 }: { goal: Goal; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = goal.children && goal.children.length > 0;

  const statusColor = 
    goal.status === "active" ? "bg-emerald-100 text-emerald-700" :
    goal.status === "completed" ? "bg-blue-100 text-blue-700" :
    "bg-gray-100 text-gray-700";

  return (
    <div className="select-none">
      <div 
        className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <div className="w-4" />
        )}
        <Target className="h-4 w-4 text-[var(--accent)]" />
        <span className="text-sm font-medium flex-1 truncate">{goal.title}</span>
        <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{goal.status}</Badge>
        {goal.due_date && (
          <span className="text-[10px] text-muted-foreground">{new Date(goal.due_date).toLocaleDateString()}</span>
        )}
        <Link href={`/goals/${goal.id}`} className="ml-2">
          <Button size="sm" variant="ghost" className="h-6 text-xs">View</Button>
        </Link>
      </div>
      
      {expanded && hasChildren && (
        <div className="border-l ml-4 pl-2 border-muted">
          {goal.children!.map((child) => (
            <GoalNode key={child.id} goal={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadGoals() {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data, error } = await supabase.from("goals").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("Load goals error:", error);
      return;
    }

    // Build Tree
    const goalMap = new Map<string, Goal>();
    const roots: Goal[] = [];
    
    (data || []).forEach((g: any) => {
      goalMap.set(g.id, { ...g, children: [] });
    });

    (data || []).forEach((g: any) => {
      const goal = goalMap.get(g.id);
      if (g.parent_goal_id && goalMap.has(g.parent_goal_id)) {
        goalMap.get(g.parent_goal_id)?.children?.push(goal!);
      } else {
        roots.push(goal!);
      }
    });

    setGoals(roots);
    setLoading(false);
  }

  useEffect(() => { loadGoals(); }, []);

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
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

      <Card>
        <CardContent className="p-4 min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading goals...
            </div>
          ) : goals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-2">No goals found.</p>
              <p className="text-sm">Start by creating a top-level mission.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {goals.map((goal) => (
                <GoalNode key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
