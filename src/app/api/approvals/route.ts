import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

// GET /api/approvals — list approvals (bypasses RLS via service role)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || undefined

    const supabase = getSupabaseAdmin()
    let query = supabase.from('approvals').select('*').order('created_at', { ascending: false })
    if (status && status !== 'all') query = query.eq('status', status)
    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/approvals — create an approval request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { approval_type, description, payload, requested_by, requested_for_agent_id } = body

    if (!approval_type || !description) {
      return NextResponse.json({ error: 'Missing approval_type or description' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('approvals')
      .insert({
        approval_type,
        description,
        payload: payload || {},
        requested_by: requested_by || 'System',
        requested_for_agent_id: requested_for_agent_id || null,
        status: 'pending',
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

// PATCH /api/approvals — resolve (approve/reject) an approval
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, resolved_by } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('approvals')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: resolved_by || 'Yas',
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log to system_updates on resolution
    if (status === 'approved') {
      const updateType = data.approval_type === 'skill_installation' ? 'skill_installed' : 'workflow_changed'
      await supabase.from('system_updates').insert({
        type: updateType,
        title: `Approved: ${data.approval_type}`,
        description: data.description,
        source_approval_id: id,
      })
    }

    return NextResponse.json({ data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
