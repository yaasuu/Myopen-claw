-- ============================================================
-- Yas Claw — UI Improvements Task Seed
-- All tasks from the dashboard evaluation + Hermes integration
-- Run once in Supabase SQL Editor to populate your Kanban board
-- ============================================================

-- ─── PHASE 1: Bug Fixes ────────────────────────────────────

insert into tasks (title, description, priority, status, owner) values
(
  'Replace prompt() with proper Review Dialog',
  'tasks/page.tsx line 307 uses the browser native prompt() to collect review notes. This is OS-styled, can''t be customised, and blocks the page. Replace with a shadcn Dialog containing a textarea for notes and confirm/cancel buttons.',
  'high',
  'pending',
  'Yas'
),
(
  'Fix hardcoded Healthy badge in header',
  'app-header.tsx always shows a green "Healthy" badge regardless of actual system state. Wire it up to poll the system_status table (same source as the Overview page) and reflect real status: healthy / degraded / down.',
  'high',
  'pending',
  'Yas'
),
(
  'Fix hardcoded System operational in sidebar footer',
  'app-sidebar.tsx footer always shows a green dot and "System operational" text. This should pull from the same system_status polling logic as the header badge — show real status.',
  'high',
  'pending',
  'Yas'
),
(
  'Replace fake Scheduled Routines strip with real Jobs Manager',
  'tasks/page.tsx has a hardcoded strip showing 3 fake routines (Daily Autonomy, Nightly Summary, Weekly Review) with static "active" status. Replace with a real jobs table query or remove entirely. Eventually connects to Hermes /api/claude-jobs.',
  'medium',
  'pending',
  'Yas'
),
(
  'Extract timeAgo() to shared utility',
  'The timeAgo() function is copy-pasted into 5+ page files (overview, tasks, alerts, workforce, live-feed). Move it once to src/lib/utils.ts and import from there across all pages.',
  'low',
  'pending',
  'Yas'
);

-- ─── PHASE 2: Overview Upgrade ─────────────────────────────

insert into tasks (title, description, priority, status, owner) values
(
  'Add 4-lane command strip to Overview',
  'Replace the current morning briefing cards with a command strip showing 4 live stats: Needs Approval (in-review count) / In Progress (in-progress count) / Done Today (done since midnight) / Signals (blocked + paused agents). Inspired by ChipChip Command Center design.',
  'high',
  'pending',
  'Yas'
),
(
  'Add Ready to Operate % health circle to Overview',
  'Add a single health percentage widget to Overview: (active agents / total agents) × 100. Show it as a donut/circle with a breakdown tooltip: X/Y agents healthy, Z open issues, N timers active. Replaces the vague 4-card summary.',
  'medium',
  'pending',
  'Yas'
),
(
  'Add Department output row to Overview',
  'Add a row below the command strip showing output stats per department (Ops / Export-Growth / Architecture-Systems). Show tasks completed this week per department. Data already exists — just needs the rollup query and UI component.',
  'medium',
  'pending',
  'Yas'
),
(
  'Fix broken Skill Coverage metric on Overview',
  'overview/page.tsx line 214 calculates skill coverage as agents.length * 3 — a hardcoded and meaningless multiplier. Either query the actual skills table for a real coverage number or remove the metric entirely and replace with something accurate.',
  'low',
  'pending',
  'Yas'
);

-- ─── PHASE 3: Hermes Integration ───────────────────────────

insert into tasks (title, description, priority, status, owner) values
(
  'Add /hermes page and sidebar link',
  'Create a new page at src/app/(dashboard)/hermes/page.tsx showing: Hermes orchestration queue, tasks with requires_yas_approval=true awaiting sign-off, recent dispatch_notes, and a placeholder for AWS/server health. Add "Hermes" link to the System section of the sidebar.',
  'high',
  'pending',
  'Yas'
),
(
  'Add Dispatch via Hermes button to task cards',
  'On each task card (board view) and in the task detail side panel, add a "Dispatch via Hermes" button. Clicking it opens a small dialog to fill dispatch_notes, then sets owner_agent_id and status to dispatched. This is the signal Hermes reads to pick up a task.',
  'high',
  'pending',
  'Yas'
),
(
  'Wire evidence/checkpoint gate to task submit flow',
  'Migration 021 added evidence, review_notes, and requires_yas_approval columns but the UI ignores them. When submitting a task for review, require an evidence field (link or text). Tasks with requires_yas_approval=true must show a special Yas approval step before reaching done.',
  'medium',
  'pending',
  'Yas'
),
(
  'Hermes ops-watch: write system_status heartbeat',
  'On the Hermes side: after each ops-watch health check, write a row to the system_status Supabase table with current server/AWS health, active agent count, and open task count. The dashboard already polls this table — it will just start showing real data.',
  'medium',
  'pending',
  'Yas'
),
(
  'Show agent session lifecycle states on agent cards',
  'Current agent cards only show active/paused/retired. Add Hermes session states: accepted → active → handoff → stalled → complete → error. Hermes writes its current run state to a sessions table and agent cards reflect it in real time.',
  'medium',
  'pending',
  'Yas'
),
(
  'Wire Greenlight Gate to requires_yas_approval flag',
  'Tasks with requires_yas_approval=true should be blocked from moving to done until Yas explicitly approves them in the Reviews page. Add a visual indicator on the task card (🔐 Yas approval required) and enforce the gate in the status transition logic.',
  'medium',
  'pending',
  'Yas'
),
(
  'Create seed SQL: all improvement tasks as Kanban cards',
  'This file — supabase/seeds/ui_improvements_tasks.sql. Documents all planned improvements as real tasks in the database so they appear in the Kanban board and can be tracked, assigned to agents, and moved through the workflow.',
  'low',
  'done',
  'Yas'
);

-- ─── PHASE 4: Navigation + Polish ──────────────────────────

insert into tasks (title, description, priority, status, owner) values
(
  'Add Departments and Goals to sidebar navigation',
  'The pages /departments and /goals exist and are fully built but are not linked from the sidebar. Add them under a new "Planning" section or under "Operations". Also check /specialists.',
  'low',
  'pending',
  'Yas'
),
(
  'Add /memory browser page',
  'Create src/app/(dashboard)/memory/page.tsx that lists and previews the agent-memory/ files from the repo/database. Lets Yas read and edit agent memory directly from the dashboard without opening files manually. Inspired by Hermes workspace memory browser.',
  'low',
  'pending',
  'Yas'
),
(
  'Add agent stats to agent detail page',
  'Hermes tracks per-agent: total runs, tokens used, estimated cost, success rate, avg response time. Add these stats to the agent detail page (/agents/[id]) once Hermes starts writing them to Supabase after each session.',
  'low',
  'pending',
  'Yas'
),
(
  'Add drift detection alert type',
  'Hermes orchestrator detects when an agent goes off-scope from its SwarmBrief. Add a new feed event type drift_detected and show it as a distinct alert in the Alerts page with the agent name and what it drifted from.',
  'low',
  'pending',
  'Yas'
),
(
  'Add /skills browser page',
  'Replace the broken Skill Coverage metric with a real /skills page that lists installed agent skills, their categories, and status. Connects to Hermes /api/skills endpoint. Add to sidebar under System.',
  'low',
  'pending',
  'Yas'
),
(
  'Remove /agents from pageTitles in app-header',
  'app-header.tsx pageTitles still includes "/agents": "Agents" but the route just redirects to /workforce. The title flashes "Agents" before the redirect. Remove the entry.',
  'low',
  'pending',
  'Yas'
),
(
  'Fix any[] type on reviews state in tasks page',
  'tasks/page.tsx line 204 types the reviews state as any[]. The task_reviews table has a proper schema from migration 011. Create a TaskReview type in src/types/dashboard.ts and replace the any[] usage.',
  'low',
  'pending',
  'Yas'
);
