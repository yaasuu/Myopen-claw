-- 033_backfill_feed_events_project_id.sql
-- Backfills project_id on existing feed_events that have a related_task_id
-- so the project Activity tab shows historical events instead of empty state.
-- Safe to run multiple times — only updates rows where project_id IS NULL.

UPDATE feed_events fe
SET project_id = t.project_id
FROM tasks t
WHERE fe.related_task_id = t.id
  AND fe.project_id IS NULL
  AND t.project_id IS NOT NULL;
