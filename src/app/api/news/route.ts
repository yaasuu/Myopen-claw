import { NextRequest, NextResponse } from "next/server";
import { getSupabaseReadOnly, getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * GET  /api/news?category=<cat>&limit=50   — list news items (newest first)
 * PATCH /api/news?id=<uuid>                 — mark read / toggle pin
 *        body: { is_read?: boolean, is_pinned?: boolean }
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "60"), 200);

  const supabase = getSupabaseReadOnly();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let query = supabase
    .from("news_items")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const updates: Record<string, boolean> = {};
  if (typeof body.is_read === "boolean") updates.is_read = body.is_read;
  if (typeof body.is_pinned === "boolean") updates.is_pinned = body.is_pinned;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("news_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
