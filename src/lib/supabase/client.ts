import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _testResult: string = "not-tested";

export async function testSupabaseConnection(): Promise<string> {
  if (_testResult !== "not-tested") return _testResult;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const keyPrefix = key ? key.slice(0, 20) + "..." : "null";
  if (!url || !key) {
    _testResult = "no-env-url:" + (!url ? "missing" : "ok") + "-key:" + (!key ? "missing" : "ok");
    return _testResult;
  }
  try {
    const client = createBrowserClient(url, key);
    const { data, error } = await client.from("agents").select("id,name").limit(5);
    if (error) {
      _testResult = "db-error-code:" + (error.code || "unknown") + " msg:" + (error.message || "").slice(0, 80) + " key:" + keyPrefix + " url:" + (url || "-").slice(0, 40);
    } else if (!data || data.length === 0) {
      _testResult = "empty-response:" + JSON.stringify(data) + " key:" + keyPrefix;
    } else {
      const names = data.map((d: any) => d.name).join(",").slice(0, 60);
      _testResult = "ok-count:" + data.length + " names:" + names + " key:" + keyPrefix;
    }
  } catch (e: any) {
    _testResult = "exception:" + (e.message || String(e)).slice(0, 100);
  }
  return _testResult;
}

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  _client = createBrowserClient(url, key);
  return _client;
}

export function isSupabaseReady(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
