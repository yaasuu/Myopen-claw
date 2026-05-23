export const runtime = "edge";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// GET uses anon key (read-only, no service role needed)
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// POST needs service role to write. Falls back gracefully with a clear error if not set.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function deriveProvider(model: string): string {
  if (model.startsWith("gemini")) return "google";
  if (/^gpt-5/.test(model)) return "openai-codex";
  return "openrouter";
}

async function sbFetch(path: string, key: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// GET /api/hermes-model → current llm_config value
export async function GET(): Promise<Response> {
  try {
    const res = await sbFetch(
      "/settings?key=eq.llm_config&select=value&limit=1",
      ANON_KEY
    );
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text }, { status: res.status });
    }
    const rows: { value: Record<string, unknown> }[] = await res.json();
    if (!rows.length) {
      return Response.json({ error: "llm_config not found" }, { status: 404 });
    }
    return Response.json(rows[0].value);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/hermes-model  body: { model: string }
export async function POST(request: Request): Promise<Response> {
  if (!SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured in Vercel — add it in Project Settings → Environment Variables" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const model = typeof body?.model === "string" ? body.model.trim() : "";
    if (!model) {
      return Response.json({ error: "model is required" }, { status: 400 });
    }

    const provider = deriveProvider(model);

    // Fetch current value to merge
    const getRes = await sbFetch(
      "/settings?key=eq.llm_config&select=value&limit=1",
      ANON_KEY
    );
    if (!getRes.ok) return Response.json({ error: "fetch failed" }, { status: 500 });
    const current: { value: Record<string, unknown> }[] = await getRes.json();
    const currentValue = current[0]?.value ?? {};
    const newValue = { ...currentValue, model, provider };

    const updateRes = await sbFetch("/settings?key=eq.llm_config", SERVICE_ROLE_KEY, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        value: newValue,
        updated_by: "yas-dashboard",
        updated_at: new Date().toISOString(),
      }),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      return Response.json({ error: text }, { status: updateRes.status });
    }

    return Response.json({ ok: true, model, provider, value: newValue });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
