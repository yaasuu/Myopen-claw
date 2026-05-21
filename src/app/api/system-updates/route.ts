import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseReadOnly } from '@/lib/supabase/server'

// POST /api/system-updates — create a system update entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, title, description, affected_entities, source_lesson_id, source_approval_id } = body

    if (!type || !title) {
      return NextResponse.json({ error: 'Missing type or title' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('system_updates')
      .insert({
        type,
        title,
        description: description || '',
        affected_entities: affected_entities || [],
        source_lesson_id: source_lesson_id || null,
        source_approval_id: source_approval_id || null,
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

// GET /api/system-updates — list recent system updates
export async function GET() {
  try {
    const supabase = getSupabaseReadOnly() ?? getSupabaseAdmin()

    const { data, error } = await supabase
      .from('system_updates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json({ data: [], error: error.message }, { status: 200 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ data: [], error: msg }, { status: 200 })
  }
}
