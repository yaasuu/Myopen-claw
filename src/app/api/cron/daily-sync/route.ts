import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    // Call the orchestrator with generate_daily_sync
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_daily_sync" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Orchestrator failed: ${errorText}` }, { status: 500 });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync generation failed" }, { status: 500 });
  }
}
