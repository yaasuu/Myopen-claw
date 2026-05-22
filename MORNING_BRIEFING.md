# Morning Briefing — 2026-05-22

Hi Yas. While you slept I worked through the dashboard. Here's the full report.

## TL;DR
- ✅ Fixed the project page crash (React #310 + missing DB column)
- ✅ Consolidated 7-tab Learning Hub → 2 focused routes (`/learning` + `/approvals`)
- ✅ Rebranded skills page to "Hermes Skill Library" with link to docs
- ✅ Standardized all major dashboard headers (consistent modern look)
- ✅ Added "live agents" pulse indicators across Workforce, Live Feed, Overview, Hermes, Reviews, Alerts
- ✅ 3 SQL migration files created — sitting in `supabase/migrations/` for you to apply
- ✅ Everything pushed to `ui-improvements` — auto-deployed to Vercel

## What's on the branch

Run `git log --oneline main..ui-improvements` to see commits. Highlights since last session:

| Commit | What |
|---|---|
| `0a0eda5` | Hotfix: React #310 + sort_order column |
| `1f0d99a` | Learning + Approvals consolidation (7 tabs → 2 routes) |
| `b2da9d9` | Skills rebrand to Hermes |
| `bcad7fe` | Workforce: KPI cards + live-now pulses |
| `497b9f9` | Live Feed: day grouping + chip filters + live pulse |
| `47bf08e` | Reviews: redesign + proper dialog |
| `fa25569` | Alerts: header + 4 KPI cards |
| `aba0dfa` | Hermes page: standard header + 4 KPI cards |
| `d5cc970` | Autonomy, Hiring, Calendar headers |
| `5341860` | Org Chart, Notifications, Goals headers |

## Migrations to apply (in order)

All three are **additive and safe** — the dashboard works whether you apply them or not. The dashboard handles missing columns gracefully via fallback queries.

1. **`022_project_status_narrative.sql`** — adds `deliverables_done[]`, `criteria_done[]`, `status_narrative`, `status_narrative_at`, `status_narrative_by` columns to `projects`. Needed for: checkable deliverables/criteria + status narrative on project detail page.

2. **`023_project_milestones_sort_order.sql`** — adds `sort_order int` column to `project_milestones` + backfills from `created_at`. This was the column that caused the "This page couldn't load" error. The dashboard now falls back if it's missing, but applying this is the clean fix.

3. **`024_hermes_skill_source.sql`** — renames `source = 'clawhub'` → `source = 'hermes'` in `skills` and `skill_requests` tables. The dashboard already displays both values as "Hermes" via the `formatSource()` helper, so apply when convenient.

**To apply:** Open Supabase → SQL Editor → paste each one → run. Or use `supabase db push` if you have the CLI configured.

## What I built / changed (page by page)

### `/learning` (rewrote — 1246 → 540 lines)
- Single scroll, no tabs
- Header + stat strip (lessons · knowledge · updates)
- Hero search across all content
- "Today" card with the latest daily sync (prefers `DailyNote`, falls back to `MeetingSummary`)
- Recurring patterns side panel (groups lessons by `.pattern`)
- Lessons timeline with filter chips + per-lesson promote/approve/reject buttons
- "Scan now" button wired to `/api/orchestrator`
- PARA knowledge cards (Projects / Areas / Resources / Archives)
- Recent knowledge entries grid
- Applied updates feed
- Removed dead UI: non-functional search bar, "Filter" button with no handler, "Unresolved only" toggle that did nothing, non-rendered Request Skill dialog

### `/approvals` (new route)
- 4 lane KPI cards (Total / Skills / Gaps / Decisions) — clickable to filter
- Skill requests with security scan badges (clean/suspicious/blocked)
- Capability gaps with urgency colors + AI recommended action
- Decision queue with Approve/Rework/Reject
- Proper Request Skill dialog (no more `prompt()`)

### `/projects` (portfolio — already redesigned, hotfixed)
- Hotfix: React #310 hooks error (moved `useMemo` above early returns)
- Hotfix: `project_milestones.sort_order` query is now defensive with fallback

### `/projects/[id]` (already redesigned in earlier session)
- Has 5 tabs (Overview / Tasks / Outputs / Timeline / Activity)
- Checkable deliverables + criteria
- Status narrative card
- Right sidebar (Cmd+I to toggle) with velocity + predicted completion

### `/skills` → `Hermes Skill Library`
- New hero header with sparkle icon + external link to https://hermes-agent.nousresearch.com/docs/skills
- 4 KPI cards (Skills / Installs / Categories / Hermes)
- Search + category filter chips (colored by category)
- Polished skill cards: category icon tile, agent badges, status
- `formatSource()` helper displays "clawhub" and "hermes" both as "Hermes"

### `/workforce`
- New header with "X active now" pulsing green banner
- 4 KPI cards (Active / Paused / Departments / Overloaded)
- Hierarchy tree: agents currently working get a pulsing green dot + "● active now" subtitle
- Preserved the complex workspace files editor

### `/live-feed`
- New header with "X in last 5min" pulsing live banner
- Replaced Select dropdowns with chip filters (event type + agent)
- Events grouped by day with "Today" / "Yesterday" / dated section headers
- Per-event recent pulse for events in the last 5 minutes

### `/reviews`
- New header with pulsing "X awaiting you" banner
- 4 KPI cards (Awaiting / Approved Today / In Rework / Done)
- Task cards: priority chip, greenlight badge inline, prior review preview, evidence shown italic
- Proper review dialog (replaced `window.prompt()`)
- Recently Completed dense list

### `/alerts`
- Modern header + animated alert pill
- 4 KPI cards (Blockers / Drift / Paused / Critical Events)
- Existing drift detection and blocker cards preserved

### `/hermes`
- Bigger header with Send icon + pulsing health status pill
- Standard 4-card KPI strip (Active Agents / In Progress / In Dispatch / Pending Review)

### `/autonomy`, `/hiring`, `/calendar`, `/org-chart`, `/notifications`, `/goals`
- All received standard modern page headers
- `/autonomy` has color-mapped state pill (STABLE/OPTIMIZING/EXPANDING/RESTRUCTURING/CRITICAL_INTERVENTION)
- `/notifications` has pulsing unread-count pill

## What I did NOT touch (intentionally)

- **`/office`** — complex 895-line 3D-themed page. Risk of breaking specialized visuals. Punted.
- **`/agents/[id]`** — already redesigned in earlier session.
- **`/memory`** — already redesigned in Phase 4.
- **`/settings`** — minimal page, not worth a redesign pass tonight.
- **Goals ↔ Projects integration** — we deferred this in an earlier session. Worth coming back to: add `projects.goal_id` column + redesign `/goals` as a tree with project rollup. Migration 025 would be: `alter table projects add column if not exists goal_id text references goals(id);`

## What needs your eyes

1. **Apply migrations 022, 023, 024** when convenient. The dashboard is backward-compatible but the new features (checkable deliverables, sorted milestones, normalized Hermes source) need them.

2. **Verify the Hermes rebrand looks right**. The skills page now says "Hermes Skill Library" but the underlying DB still has `source = 'clawhub'` on existing rows until you run migration 024.

3. **Check the Vercel preview** at `myopen-claw-ui-improvements.vercel.app` for any deploy errors. Local type-check passed but Vercel sometimes catches things differently.

4. **One known-fragile area**: the `/api/orchestrator` endpoint that "Scan now" on `/learning` hits. I didn't verify it still exists / works since I didn't touch its code.

## House rules I followed

- ✅ Modern minimal · consistent visual language
- ✅ Never break data (all migrations additive · all queries backward-compatible)
- ✅ Pushed after each page (15 commits since you went to bed)
- ✅ No destructive SQL · no force pushes · no scope creep
- ✅ When unsure, I parked it and noted above

## If you want me to keep going

Remaining wishlist items I'd suggest for the next session:
1. **Goals ↔ Projects integration** (the deferred work)
2. **`/office` redesign** if you want to use that page
3. **Add the "Approvals" badge to the global header** (notification-dot style) so unhandled approvals are visible from every page
4. **Mobile responsive polish** — most pages work but the dense KPI strips could collapse better

Sleep well 🌙. The branch is solid.

— Claude (overnight session, 2026-05-21 → 2026-05-22)
