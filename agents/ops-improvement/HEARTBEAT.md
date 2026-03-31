# Ops-Improvement Agent — Heartbeat

# Hourly workflow check
{
  "schedule": { "kind": "cron", "expr": "0 * * * *" },
  "payload": { "kind": "agentEvent", "text": "Review assigned tasks, check for bottlenecks, update status" },
  "sessionTarget": "ops-improvement",
  "enabled": true
}

# Daily process review
{
  "schedule": { "kind": "cron", "expr": "0 10 * * 1" },
  "payload": { "kind": "agentEvent", "text": "Weekly workflow review, identify bottlenecks, propose improvements" },
  "sessionTarget": "ops-improvement",
  "enabled": true
}
