// ─── Collaboration signal extraction from feed events ───

import type { FeedEvent } from "@/types/dashboard";

const FRESHNESS_DISCUSSION = 30 * 60 * 1000;   // 30 minutes
const FRESHNESS_COORDINATION = 15 * 60 * 1000;  // 15 minutes
const FRESHNESS_BLOCKER = 2 * 60 * 60 * 1000;   // 2 hours
const FRESHNESS_REVIEW = 60 * 60 * 1000;         // 1 hour

export interface CollaborationSignal {
  agentId: string;
  discussionId: string | null;
  discussionSummary: string | null;
  reviewTargetTaskId: string | null;
  blockerTaskId: string | null;
  blockerSummary: string | null;
  isRouted: boolean;
  routedBy: string | null;
  routedAt: string | null;
}

export interface CoordinationState {
  isCoordinating: boolean;
  recentRoutes: { agentId: string; summary: string; at: string }[];
  pendingReviews: { agentId: string; taskId: string }[];
  activeDiscussions: { agentId: string; summary: string; at: string }[];
}

function isRecent(iso: string, windowMs: number): boolean {
  return Date.now() - new Date(iso).getTime() < windowMs;
}

/**
 * Extract all collaboration signals from feed events.
 * Each agent gets at most one signal based on most recent relevant event.
 */
export function computeCollaborationSignals(
  feedEvents: FeedEvent[],
  agentIds: string[]
): Map<string, CollaborationSignal> {
  const signals = new Map<string, CollaborationSignal>();

  for (const agentId of agentIds) {
    signals.set(agentId, {
      agentId,
      discussionId: null,
      discussionSummary: null,
      reviewTargetTaskId: null,
      blockerTaskId: null,
      blockerSummary: null,
      isRouted: false,
      routedBy: null,
      routedAt: null,
    });
  }

  for (const event of feedEvents) {
    const aid = event.related_agent_id;
    if (!aid || !signals.has(aid)) continue;
    const sig = signals.get(aid)!;

    // Discussion signals (fresh 30 min)
    if (
      (event.event_type === "discussion_started" || event.event_type === "discussion_summary_logged") &&
      isRecent(event.created_at, FRESHNESS_DISCUSSION)
    ) {
      if (!sig.discussionId) {
        sig.discussionId = event.id;
        sig.discussionSummary = event.summary;
      }
    }

    // Review / approval signals (fresh 1 hour)
    if (
      (event.event_type === "approval_requested") &&
      isRecent(event.created_at, FRESHNESS_REVIEW)
    ) {
      if (!sig.reviewTargetTaskId) {
        sig.reviewTargetTaskId = event.related_task_id;
      }
    }

    // Blocker signals (fresh 2 hours)
    if (
      event.event_type === "blocker_detected" &&
      isRecent(event.created_at, FRESHNESS_BLOCKER)
    ) {
      if (!sig.blockerTaskId) {
        sig.blockerTaskId = event.related_task_id;
        sig.blockerSummary = event.summary;
      }
    }

    // Coordination / routing (fresh 15 min)
    if (
      event.event_type === "agent_routed" &&
      isRecent(event.created_at, FRESHNESS_COORDINATION)
    ) {
      sig.isRouted = true;
      sig.routedBy = event.source;
      sig.routedAt = event.created_at;
    }
  }

  return signals;
}

/**
 * Compute overall coordination state for the orchestrator (Yas Claw).
 */
export function computeCoordinationState(
  feedEvents: FeedEvent[],
  agentIds: string[]
): CoordinationState {
  const recentRoutes: CoordinationState["recentRoutes"] = [];
  const pendingReviews: CoordinationState["pendingReviews"] = [];
  const activeDiscussions: CoordinationState["activeDiscussions"] = [];

  for (const event of feedEvents) {
    if (event.event_type === "agent_routed" && isRecent(event.created_at, FRESHNESS_COORDINATION)) {
      if (event.related_agent_id) {
        recentRoutes.push({
          agentId: event.related_agent_id,
          summary: event.summary,
          at: event.created_at,
        });
      }
    }
    if (event.event_type === "approval_requested" && isRecent(event.created_at, FRESHNESS_REVIEW)) {
      if (event.related_agent_id && event.related_task_id) {
        pendingReviews.push({
          agentId: event.related_agent_id,
          taskId: event.related_task_id,
        });
      }
    }
    if (
      (event.event_type === "discussion_started" || event.event_type === "discussion_summary_logged") &&
      isRecent(event.created_at, FRESHNESS_DISCUSSION)
    ) {
      if (event.related_agent_id) {
        activeDiscussions.push({
          agentId: event.related_agent_id,
          summary: event.summary,
          at: event.created_at,
        });
      }
    }
  }

  return {
    isCoordinating: recentRoutes.length > 0 || pendingReviews.length > 0 || activeDiscussions.length > 0,
    recentRoutes,
    pendingReviews,
    activeDiscussions,
  };
}
