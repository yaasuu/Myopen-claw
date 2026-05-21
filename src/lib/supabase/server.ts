import { createClient } from '@supabase/supabase-js'

// Server-side client with service role key — bypasses RLS
// Falls back to anon client if service role key is not available
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    // Fall back to anon client — works for tables without RLS restrictions
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error('Missing Supabase URL or keys in server environment')
    }
    return createClient(url, anonKey)
  }

  return createClient(url, key)
}

// Read-only server client for GET routes and safe fallbacks.
export function getSupabaseReadOnly() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key)
}
