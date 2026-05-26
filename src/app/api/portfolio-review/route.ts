export const runtime = "edge";

/**
 * POST /api/portfolio-review
 *
 * Calls a real LLM (Gemini 2.5 Flash → OpenRouter fallback) to analyse
 * the current project portfolio and return structured executive insights.
 *
 * Body: { projects, healthScores, signals, stats, agents }
 * Returns: PortfolioReview (topRisks, bottlenecks, mostEfficientDept,
 *          projectsNeedingIntervention, recommendedActions, timestamp, model)
 */

const GEMINI_KEY      = process.env.GEMINI_API_KEY;
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.service_role ?? "";

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(body: Record<string, unknown>): string {
  const { projects = [], healthScores = {}, signals = [], stats = {}, agents = [] } = body as {
    projects: Array<{
      id: string; project_code: string; title: string; status: string;
      open_tasks: number; blocked_tasks: number; completed_tasks: number;
      due_date: string | null; owner_department: string;
    }>;
    healthScores: Record<string, { status: string; score: number }>;
    signals: Array<{ type: string; severity: string; message: string }>;
    stats: Record<string, unknown>;
    agents: Array<{ name: string; status: string; specialist_domain: string }>;
  };

  const projectLines = projects.map(p => {
    const h = (healthScores as Record<string, { status: string; score: number }>)[p.id as string] ?? { status: "unknown", score: 0 };
    const overdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== "completed"
      ? " [OVERDUE]" : "";
    return `- ${p.project_code}: "${p.title}" | status=${p.status}${overdue} | health=${h.status}(${h.score}) | open=${p.open_tasks} blocked=${p.blocked_tasks} done=${p.completed_tasks} | dept=${p.owner_department}`;
  }).join("\n");

  const signalLines = (signals as Array<{ type: string; severity: string; message: string }>)
    .map(s => `- [${s.severity.toUpperCase()}] ${s.message}`)
    .join("\n");

  const agentLines = (agents as Array<{ name: string; status: string; specialist_domain: string }>)
    .filter(a => a.status !== "active")
    .map(a => `- ${a.name} (${a.status}) — ${a.specialist_domain}`)
    .join("\n") || "All agents active";

  return `You are the COO of an export trading business reviewing your AI-managed project portfolio.

PORTFOLIO SUMMARY:
- Total projects: ${stats.total ?? projects.length}
- Active: ${stats.active ?? "?"} | Blocked: ${stats.blocked ?? "?"} | Critical: ${stats.critical ?? "?"} | Overdue: ${stats.overdue ?? "?"}
- Avg health score: ${stats.avgHealth ?? "?"}

PROJECTS:
${projectLines || "No projects"}

EXECUTIVE SIGNALS:
${signalLines || "No signals"}

NON-ACTIVE AGENTS:
${agentLines}

Analyse this portfolio and respond with ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "topRisks": ["<string>", ...],
  "bottlenecks": ["<string>", ...],
  "mostEfficientDept": "<string>",
  "projectsNeedingIntervention": ["<string>", ...],
  "recommendedActions": ["<string>", ...]
}

Rules:
- topRisks: 1–4 specific risks with project names/codes, or [] if none
- bottlenecks: 1–3 department/process bottlenecks, or [] if none
- mostEfficientDept: single department name with highest completion ratio, or "N/A"
- projectsNeedingIntervention: list as "CODE: title — reason", only critical/at_risk projects
- recommendedActions: 2–4 concrete COO-level actions, ordered by priority
- Be specific — use project codes, agent names, department names from the data above
- If portfolio is healthy, still give 1–2 forward-looking recommendations`;
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
        }),
      }
    );
    const data = await res.json() as { error?: { message: string }; candidates?: Array<{ content: { parts: Array<{ text: string }> } }> };
    if (data.error) { console.error("Gemini error:", data.error.message); return null; }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (e) {
    console.error("Gemini call failed:", e);
    return null;
  }
}

// ── OpenRouter fallback ───────────────────────────────────────────────────────

async function callOpenRouter(prompt: string): Promise<string | null> {
  if (!OPENROUTER_KEY) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b:free",
        messages: [
          { role: "system", content: "You are an expert COO. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });
    const data = await res.json() as { error?: { message: string }; choices?: Array<{ message: { content: string } }> };
    if (data.error) { console.error("OpenRouter error:", data.error.message); return null; }
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("OpenRouter call failed:", e);
    return null;
  }
}

// ── Parse AI response ─────────────────────────────────────────────────────────

function parseReview(raw: string): Record<string, unknown> | null {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    // Validate required keys exist
    if (!Array.isArray(parsed.topRisks) || !Array.isArray(parsed.recommendedActions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Log to feed_events ────────────────────────────────────────────────────────

async function logFeedEvent(model: string, riskCount: number, interventionCount: number) {
  if (!SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/feed_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        event_type: "portfolio_review_run",
        source: "Hermes Orchestrator",
        summary: `AI portfolio review completed via ${model} — ${riskCount} risk(s), ${interventionCount} project(s) flagged for intervention`,
      }),
    });
  } catch { /* non-critical */ }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return Response.json({ error: "Request body required" }, { status: 400 });
    }

    const prompt = buildPrompt(body as Record<string, unknown>);

    // Try Gemini first, fall back to OpenRouter
    let raw: string | null = null;
    let modelUsed = "gemini-2.5-flash";

    raw = await callGemini(prompt);

    if (!raw) {
      modelUsed = "openai/gpt-oss-120b:free";
      raw = await callOpenRouter(prompt);
    }

    if (!raw) {
      return Response.json({ error: "All AI providers failed or quota exceeded. Try again shortly." }, { status: 503 });
    }

    const review = parseReview(raw);
    if (!review) {
      return Response.json({ error: "AI returned unparseable response", raw }, { status: 502 });
    }

    const result = {
      ...review,
      timestamp: new Date().toISOString(),
      model: modelUsed,
    };

    // Log async — don't block response
    logFeedEvent(
      modelUsed,
      (review.topRisks as string[]).length,
      (review.projectsNeedingIntervention as string[]).length
    );

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
