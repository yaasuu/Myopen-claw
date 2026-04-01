"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckSquare,
  FolderOpen,
  Clock,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import type { TaskWithAgent } from "@/types/dashboard";

interface RelatedContextProps {
  tasks?: TaskWithAgent[];
  projectName?: string;
  projectId?: string;
  lastActivity?: string | null;
  maxItems?: number;
  showViewAll?: boolean;
  viewAllHref?: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RelatedContext({
  tasks = [],
  projectName,
  projectId,
  lastActivity,
  maxItems = 3,
  showViewAll = true,
  viewAllHref,
}: RelatedContextProps) {
  const openTasks = tasks.filter((t) => t.status !== "done");
  const visibleTasks = openTasks.slice(0, maxItems);
  const hasMore = openTasks.length > maxItems;

  return (
    <div className="space-y-3">
      {/* Linked project */}
      {projectName && (
        <div className="flex items-center gap-2 text-xs">
          <FolderOpen className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
          <span style={{ color: "var(--text-muted)" }}>Project:</span>
          {projectId ? (
            <Link href={`/projects/${projectId}`} className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
              {projectName}
            </Link>
          ) : (
            <span className="font-medium" style={{ color: "var(--text)" }}>{projectName}</span>
          )}
        </div>
      )}

      {/* Linked tasks */}
      {openTasks.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <CheckSquare className="h-3.5 w-3.5" style={{ color: "var(--text-quiet)" }} />
            {openTasks.length} open task{openTasks.length !== 1 ? "s" : ""}
          </div>
          {visibleTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-[var(--surface-muted)] transition-colors">
              <div className={`h-1.5 w-1.5 rounded-full ${task.status === "blocked" ? "dot-red" : task.status === "in-progress" ? "dot-blue" : "dot-gray"}`} />
              <span className="text-xs truncate flex-1" style={{ color: "var(--text)" }}>{task.title}</span>
              {task.blocker && <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: "var(--danger)" }} />}
            </div>
          ))}
          {hasMore && showViewAll && viewAllHref && (
            <Link href={viewAllHref} className="text-xs hover:underline block pt-1" style={{ color: "var(--accent)" }}>
              View all {openTasks.length} tasks →
            </Link>
          )}
        </div>
      )}

      {/* Last activity */}
      {lastActivity && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-quiet)" }}>
          <Clock className="h-3 w-3" />
          Last active {timeAgo(lastActivity)}
        </div>
      )}

      {/* Empty state */}
      {openTasks.length === 0 && !projectName && !lastActivity && (
        <p className="text-xs" style={{ color: "var(--text-quiet)" }}>No linked context</p>
      )}
    </div>
  );
}
