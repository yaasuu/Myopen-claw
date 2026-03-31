import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  try {
    _client = createBrowserClient(url, key);
  } catch (e) {
    // createBrowserClient failed — fall back to standard client
    try {
      const { createClient } = require("@supabase/supabase-js");
      _client = createClient(url, key);
    } catch (e2) {
      return null;
    }
  }

  return _client;
}

export function getSupabase(): SupabaseClient | null {
  return getClient();
}

export function isSupabaseReady(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
