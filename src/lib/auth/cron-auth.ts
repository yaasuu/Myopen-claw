import { NextResponse } from "next/server";

/**
 * Fail-CLOSED auth for cron + machine-to-machine endpoints.
 *
 * Returns a NextResponse to short-circuit with (caller must return it), or
 * null when the request is authorized.
 *
 * Behavior:
 *  - CRON_SECRET unset      → 503 (refuse rather than run unauthenticated).
 *  - Authorization mismatch → 401.
 *  - Match                  → null (proceed).
 *
 * Vercel-native cron invocations automatically include
 * `Authorization: Bearer <CRON_SECRET>` when the env var is set, so the four
 * vercel.json crons authenticate with no extra config. External callers
 * (the EC2 crontab, Hermes) must send the same header explicitly.
 */
export function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured — endpoint disabled" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
