# Export-Growth Agent — Heartbeat

# Hourly task review
{
  "schedule": { "kind": "cron", "expr": "0 * * * *" },
  "payload": { "kind": "agentEvent", "text": "Review assigned tasks, check for blockers, update status" },
  "sessionTarget": "export-growth",
  "enabled": true
}

# Daily buyer follow-up check
{
  "schedule": { "kind": "cron", "expr": "0 9 * * *" },
  "payload": { "kind": "agentEvent", "text": "Review buyer follow-ups, check response times, flag overdue" },
  "sessionTarget": "export-growth",
  "enabled": true
}
