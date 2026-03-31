import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  let response = NextResponse.json({ success: false });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const cookies: Array<{ name: string; value: string }> = [];
          const cookieHeader = request.headers.get("cookie");
          if (cookieHeader) {
            cookieHeader.split(";").forEach((c) => {
              const [name, ...rest] = c.trim().split("=");
              if (name) cookies.push({ name, value: rest.join("=") });
            });
          }
          return cookies;
        },
        setAll(cookiesToSet) {
          // Create a new response that carries the cookies
          response = NextResponse.json({ success: true, user: { email } });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return response;
}
