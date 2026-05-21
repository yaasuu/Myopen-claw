import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseReadOnly } from '@/lib/supabase/server'

// POST /api/lessons — create a new lesson
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, lesson_statement, pattern, affected_agents, proposed_fix, confidence, source_type, pattern_type, proposed_fix_type } = body

    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('lessons')
      .insert({
        title,
        lesson_statement: lesson_statement || '',
        pattern: pattern || '',
        affected_agents: affected_agents || [],
        proposed_fix: proposed_fix || '',
        confidence: confidence || 'medium',
        source_type: source_type || 'manual',
        pattern_type: pattern_type || 'observation',
        proposed_fix_type: proposed_fix_type || 'process_change',
        status: 'pending',
        date_detected: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH /api/lessons — update lesson status
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, approved_by } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const update: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'approved' || status === 'applied') {
      update.approved_by = approved_by || 'Yas'
    }
    if (status === 'applied') {
      update.applied_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('lessons')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/lessons — list lessons (bypasses RLS via service role)
export async function GET() {
  try {
    const supabase = getSupabaseReadOnly() ?? getSupabaseAdmin()

    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .order('date_detected', { ascending: false })

    if (error) {
      return NextResponse.json({ data: [], error: error.message }, { status: 200 })
    }
    return NextResponse.json({ data: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ data: [], error: msg }, { status: 200 })
  }
}
