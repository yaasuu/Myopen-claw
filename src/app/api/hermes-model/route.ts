export const runtime = "edge";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function deriveProvider(model: string): string {
  if (model.startsWith("gemini")) return "google";
  if (/^(gpt-4|gpt-3|o1|o3)/.test(model)) return "openai";
  return "openrouter";
}

async function sbFetch(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// GET /api/hermes-model → { model, provider, maxTokens, fallbackModel, fallbackProvider }
export async function GET(): Promise<Response> {
  try {
    const res = await sbFetch("/settings?key=eq.llm_config&select=value&limit=1");
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
// Updates settings.llm_config.model + provider, returns updated value
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const model = typeof body?.model === "string" ? body.model.trim() : "";
    if (!model) {
      return Response.json({ error: "model is required" }, { status: 400 });
    }

    const provider = deriveProvider(model);

    // Patch only model + provider fields inside the JSONB value
    const patch = `value = value || '{"model":${JSON.stringify(model)},"provider":${JSON.stringify(provider)}}'::jsonb, updated_by = 'yas-dashboard', updated_at = now()`;

    const res = await sbFetch("/settings?key=eq.llm_config", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        value: { model, provider }, // will be merged below
      }),
    });

    // Supabase PATCH replaces the whole value — instead use rpc or re-fetch current and merge
    // Re-fetch current value, merge, then update
    const getRes = await sbFetch("/settings?key=eq.llm_config&select=value&limit=1");
    if (!getRes.ok) return Response.json({ error: "fetch failed" }, { status: 500 });
    const current: { value: Record<string, unknown> }[] = await getRes.json();
    const currentValue = current[0]?.value ?? {};

    const newValue = { ...currentValue, model, provider };

    const updateRes = await sbFetch("/settings?key=eq.llm_config", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ value: newValue, updated_by: "yas-dashboard", updated_at: new Date().toISOString() }),
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
