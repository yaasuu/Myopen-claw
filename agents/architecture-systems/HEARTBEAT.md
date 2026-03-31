# Architecture-Systems Agent — Heartbeat

# Hourly system check
{
  "schedule": { "kind": "cron", "expr": "0 * * * *" },
  "payload": { "kind": "agentEvent", "text": "Review assigned tasks, check build status, update progress" },
  "sessionTarget": "architecture-systems",
  "enabled": true
}

# Daily deployment check
{
  "schedule": { "kind": "cron", "expr": "0 8 * * *" },
  "payload": { "kind": "agentEvent", "text": "Check deployment status, review build logs, flag issues" },
  "sessionTarget": "architecture-systems",
  "enabled": true
}
