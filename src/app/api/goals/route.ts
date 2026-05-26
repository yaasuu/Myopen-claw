import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseReadOnly } from "@/lib/supabase/server";

// GET /api/goals?project_id=<uuid>  — list goals (optionally scoped to project)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("project_id");

    const supabase = getSupabaseReadOnly();
    if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

    let query = supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/goals  — create a new goal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const {
      title,
      description = "",
      status = "active",
      priority = "medium",
      project_id = null,
      owner = "",
      due_date = null,
      progress = 0,
    } = body;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("goals")
      .insert({
        title: title.trim(),
        description,
        status,
        priority,
        project_id,
        owner,
        due_date,
        progress,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/goals?id=<uuid>  — update a goal
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("goals")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
