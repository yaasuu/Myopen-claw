import { createClient } from '@supabase/supabase-js'

// Server-side client with service role key — bypasses RLS
// This file should NEVER be imported by client components
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment')
  }

  return createClient(url, key)
}
