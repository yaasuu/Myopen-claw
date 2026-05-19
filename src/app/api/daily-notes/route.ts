import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

// POST /api/daily-notes — create or update a daily review note
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      date,
      summary,
      events_reviewed,
      decisions,
      blockers,
      priorities_tomorrow,
      agent_updates,
      cross_team_summary,
      skill_gaps,
      issues_list,
      yas_decisions,
      wins,
      sync_type,
    } = body

    if (!date) {
      return NextResponse.json({ error: 'Missing date' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Check if a note already exists for this date
    const { data: existing } = await supabase
      .from('daily_notes')
      .select('id')
      .eq('date', date)
      .maybeSingle()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('daily_notes')
        .update({
          summary: summary || '',
          events_reviewed: events_reviewed || 0,
          decisions: decisions || [],
          blockers: blockers || [],
          priorities_tomorrow: priorities_tomorrow || [],
          agent_updates: agent_updates || [],
          cross_team_summary: cross_team_summary || {},
          skill_gaps: skill_gaps || [],
          issues_list: issues_list || [],
          yas_decisions: yas_decisions || [],
          wins: wins || [],
          sync_type: sync_type || 'full',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, updated: true })
    } else {
      // Create new
      const { data, error } = await supabase
        .from('daily_notes')
        .insert({
          date,
          summary: summary || '',
          events_reviewed: events_reviewed || 0,
          decisions: decisions || [],
          blockers: blockers || [],
          priorities_tomorrow: priorities_tomorrow || [],
          agent_updates: agent_updates || [],
          cross_team_summary: cross_team_summary || {},
          skill_gaps: skill_gaps || [],
          issues_list: issues_list || [],
          yas_decisions: yas_decisions || [],
          wins: wins || [],
          sync_type: sync_type || 'full',
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data, created: true })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
