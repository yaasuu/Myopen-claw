import { getSupabase } from "@/lib/supabase/client";
import type { WorkspaceFile, FileRegistry, UnitType } from "@/types/dashboard";

// ── File Registry by Unit Type ──────────────────────

export const FILE_REGISTRY: Record<UnitType, FileRegistry[]> = {
  orchestrator: [
    { name: "IDENTITY.md", label: "Identity", icon: "🦀" },
    { name: "MEMORY.md", label: "Memory", icon: "💾" },
    { name: "AUTONOMY.md", label: "Autonomy", icon: "🤖" },
    { name: "GOVERNANCE.md", label: "Governance", icon: "⚖️" },
    { name: "DECISIONS.md", label: "Decisions", icon: "📋" },
    { name: "PERFORMANCE.md", label: "Performance", icon: "📊" },
    { name: "HEARTBEAT.md", label: "Heartbeat", icon: "💓" },
    { name: "NOTES.md", label: "Notes", icon: "📝" },
  ],
  department: [
    { name: "SOUL.md", label: "Soul", icon: "🧠" },
    { name: "MEMORY.md", label: "Memory", icon: "💾" },
    { name: "PIPELINE.md", label: "Pipeline", icon: "🔄" },
    { name: "SOP.md", label: "SOP", icon: "📖" },
    { name: "PERFORMANCE.md", label: "Performance", icon: "📊" },
    { name: "PLAYBOOK.md", label: "Playbook", icon: "🎮" },
    { name: "NOTES.md", label: "Notes", icon: "📝" },
  ],
  agent: [
    { name: "SOUL.md", label: "Soul", icon: "🧠" },
    { name: "MEMORY.md", label: "Memory", icon: "💾" },
    { name: "SOP.md", label: "SOP", icon: "📖" },
    { name: "PERFORMANCE.md", label: "Performance", icon: "📊" },
    { name: "NOTES.md", label: "Notes", icon: "📝" },
  ],
  specialist: [
    { name: "MISSION.md", label: "Mission", icon: "🎯" },
    { name: "OUTPUT.md", label: "Output", icon: "📤" },
    { name: "NOTES.md", label: "Notes", icon: "📝" },
  ],
};

// ── Starter Templates ───────────────────────────────

const STARTER_TEMPLATES: Record<string, (name: string) => string> = {
  "SOUL.md": (name) => `# ${name} — Soul\n\n## Role\n[Define the role]\n\n## Mandate\n[What this unit is responsible for]\n\n## Responsibilities\n- [Responsibility 1]\n- [Responsibility 2]\n\n## Constraints\n- [Constraint 1]\n\n## Output Style\n[How this unit communicates results]`,
  "MEMORY.md": (name) => `# ${name} — Memory\n\n## Current Context\n[What is happening right now]\n\n## Ongoing Priorities\n- [Priority 1]\n- [Priority 2]\n\n## Known Issues\n- [Issue 1]\n\n## Recurring Patterns\n- [Pattern 1]\n\n## Recent Lessons\n- [Lesson 1]`,
  "SOP.md": (name) => `# ${name} — Standard Operating Procedure\n\n## Purpose\n[What this SOP covers]\n\n## Steps\n1. [Step 1]\n2. [Step 2]\n3. [Step 3]\n\n## Escalation Rules\n- [When to escalate]\n\n## Cadence\n[How often this runs]\n\n## Risks\n- [Risk 1]`,
  "PIPELINE.md": (name) => `# ${name} — Pipeline\n\n## Workflow Stages\n1. [Stage 1]\n2. [Stage 2]\n3. [Stage 3]\n\n## Inputs\n- [What goes in]\n\n## Outputs\n- [What comes out]\n\n## Bottlenecks\n- [Known bottleneck]\n\n## Hand-offs\n- [Who receives the output]`,
  "MISSION.md": (name) => `# ${name} — Mission\n\n## Objective\n[What needs to be achieved]\n\n## Scope\n[What is included and excluded]\n\n## Linked Work\n- [Related task/project]\n\n## Expected Output\n[What the result should look like]\n\n## End Condition\n[When is this considered done]`,
  "IDENTITY.md": (name) => `# ${name} — Identity\n\n## Name\n${name}\n\n## Role\n[Define the role]\n\n## Domain\n[What this unit operates in]\n\n## Mission\n[Core purpose]`,
  "AUTONOMY.md": () => `# Autonomy\n\n## Current State\n- Status: Active\n- Level: Supervised\n- Last Review: [Date]\n\n## Operating Rules\n- [Rule 1]\n- [Rule 2]\n\n## Boundaries\n- [What requires approval]`,
  "GOVERNANCE.md": () => `# Governance\n\n## Decision Authority\n- [What this unit can decide]\n- [What requires CEO approval]\n\n## Review Cadence\n- Daily: [What]\n- Weekly: [What]\n- Monthly: [What]`,
  "DECISIONS.md": () => `# Decision Log\n\n## Recent Decisions\n- [Decision 1] — [Date]\n- [Decision 2] — [Date]\n\n## Pending Decisions\n- [Decision needing attention]`,
  "PERFORMANCE.md": (name) => `# ${name} — Performance\n\n## Metrics\n- Tasks completed: [X]\n- Average resolution time: [X]\n- Blocked ratio: [X%]\n\n## Trends\n- [Trend 1]\n\n## Recommendations\n- [Recommendation 1]`,
  "HEARTBEAT.md": (name) => `# ${name} — Heartbeat\n\n## Schedule\n- Hourly: [Check]\n- Daily: [Check]\n\n## Last Check\n- Time: [Timestamp]\n- Status: [Healthy/Degraded]\n\n## Alerts\n- [Alert if any]`,
  "PLAYBOOK.md": (name) => `# ${name} — Playbook\n\n## Common Scenarios\n### Scenario 1\n- Trigger: [What happens]\n- Response: [What to do]\n- Owner: [Who]\n\n## Best Practices\n- [Practice 1]\n\n## Anti-patterns\n- [What to avoid]`,
  "NOTES.md": (name) => `# ${name} — Notes\n\n## Working Notes\n- [Note 1]\n\n## Ideas\n- [Idea 1]\n\n## Follow-ups\n- [Item to follow up on]`,
  "OUTPUT.md": (name) => `# ${name} — Output\n\n## Deliverables\n- [Deliverable 1]\n\n## Status\n- [Status of each deliverable]\n\n## Quality Notes\n- [Notes on output quality]`,
};

// ── CRUD Operations ─────────────────────────────────

export async function getWorkspaceFiles(
  unitType: UnitType,
  unitId: string
): Promise<{ data: WorkspaceFile[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: [], error: null };

  const { data, error } = await supabase
    .from("workspace_files")
    .select("*")
    .eq("unit_type", unitType)
    .eq("unit_id", unitId)
    .order("file_name", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as WorkspaceFile[], error: null };
}

export async function getOrCreateFile(
  unitType: UnitType,
  unitId: string,
  fileName: string,
  unitName: string
): Promise<{ data: WorkspaceFile | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  // Try to get existing
  const { data: existing } = await supabase
    .from("workspace_files")
    .select("*")
    .eq("unit_type", unitType)
    .eq("unit_id", unitId)
    .eq("file_name", fileName)
    .maybeSingle();

  if (existing) return { data: existing as WorkspaceFile, error: null };

  // Create with starter template
  const template = STARTER_TEMPLATES[fileName];
  const content = template ? template(unitName) : "";

  const { data, error } = await supabase
    .from("workspace_files")
    .insert({
      unit_type: unitType,
      unit_id: unitId,
      file_name: fileName,
      file_content: content,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as WorkspaceFile, error: null };
}

export async function updateFile(
  fileId: string,
  content: string
): Promise<{ data: WorkspaceFile | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: "Supabase not connected" };

  const { data, error } = await supabase
    .from("workspace_files")
    .update({ file_content: content, updated_at: new Date().toISOString() })
    .eq("id", fileId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as WorkspaceFile, error: null };
}
