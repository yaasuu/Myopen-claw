import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";

    // Trigger the deep-dive Nightly Summary (A-G Report)
    const response = await fetch(`${baseUrl}/api/orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_nightly_summary" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Orchestrator failed: ${errorText}` }, { status: 500 });
    }

    const result = await response.json();
    
    // Log the successful run to the feed
    await fetch(`${baseUrl}/api/orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "log_feed_event",
        event_type: "governance_daily_run",
        summary: "Nightly Summary (23:00 Addis) generated successfully."
      }),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Nightly summary failed" }, { status: 500 });
  }
}
