import { getSupabase } from "@/lib/supabase/client";
import type { OrgNode } from "@/types/dashboard";

const MOCK_ORG_NODES: OrgNode[] = [
  {
    id: "mock-root",
    name: "Yas Claw",
    role: "System Operator / AI Chief of Staff",
    emoji: "🦀",
    status: "active",
    parent_id: null,
    sort_order: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-1",
    name: "Export-Growth Agent",
    role: "Export execution, leads, buyer follow-up",
    emoji: "📦",
    status: "active",
    parent_id: "mock-root",
    sort_order: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-2",
    name: "Ops-Improvement Agent",
    role: "Workflows, routines, process improvement",
    emoji: "⚙️",
    status: "active",
    parent_id: "mock-root",
    sort_order: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: "mock-3",
    name: "Architecture-Systems Agent",
    role: "Platform design, data modeling, system architecture",
    emoji: "🏗️",
    status: "paused",
    parent_id: "mock-root",
    sort_order: 3,
    created_at: new Date().toISOString(),
  },
];

export interface OrgTree {
  node: OrgNode;
  children: OrgTree[];
}

export async function getOrgNodes(): Promise<{ data: OrgNode[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: MOCK_ORG_NODES, error: null };

  const { data, error } = await supabase
    .from("org_nodes")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as OrgNode[], error: null };
}

export async function getOrgTree(): Promise<{ data: OrgTree | null; error: string | null }> {
  const { data: nodes, error } = await getOrgNodes();
  if (error) return { data: null, error };
  if (nodes.length === 0) return { data: null, error: null };

  const root = nodes.find((n) => n.parent_id === null);
  if (!root) return { data: null, error: null };

  function buildTree(node: OrgNode): OrgTree {
    const children = nodes
      .filter((n) => n.parent_id === node.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(buildTree);
    return { node, children };
  }

  return { data: buildTree(root), error: null };
}
