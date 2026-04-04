"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase/client";

type TableName = "tasks" | "agents" | "feed_events" | "system_status" | "audit_log" | "notifications" | "departments" | "specialists" | "specialist_types" | "skills" | "agent_skills" | "skill_requests" | "daily_notes" | "knowledge_entries" | "projects" | "project_milestones" | "project_reviews" | "project_decisions" | "task_comments" | "task_reviews" | "lessons" | "system_updates";

/**
 * Subscribes to Supabase realtime changes on a table.
 * Calls `onUpdate` whenever an INSERT, UPDATE, or DELETE occurs.
 * Returns connection status for UI indicators.
 */
export function useRealtime(
  table: TableName,
  onUpdate: () => void,
  enabled = true
): { connected: boolean; lastSynced: Date | null } {
  const [connected, setConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          callbackRef.current();
          setLastSynced(new Date());
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          setLastSynced(new Date());
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [table, enabled]);

  return { connected, lastSynced };
}

/**
 * Subscribes to multiple tables at once.
 */
export function useRealtimeMulti(
  tables: TableName[],
  onUpdate: () => void,
  enabled = true
): { connected: boolean; lastSynced: Date | null } {
  const [connected, setConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channels = tables.map((table) => {
      const channel = supabase
        .channel(`realtime:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            callbackRef.current();
            setLastSynced(new Date());
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnected(true);
            setLastSynced(new Date());
          }
        });
      return channel;
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
      setConnected(false);
    };
  }, [tables.join(","), enabled]);

  return { connected, lastSynced };
}
