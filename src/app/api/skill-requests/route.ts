import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

// PATCH /api/skill-requests — approve or reject a skill request
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, reviewed_by } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be: approved, rejected, or pending' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('skill_requests')
      .update({
        status,
        reviewed_by: reviewed_by || 'Yas',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log to system_updates
    if (status === 'approved') {
      await supabase.from('system_updates').insert({
        type: 'skill_installed',
        title: `Installed: ${data.title}`,
        description: data.description,
      })
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/skill-requests — list skill requests
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('skill_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ data: [], error: error.message }, { status: 200 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ data: [], error: msg }, { status: 200 })
  }
}
