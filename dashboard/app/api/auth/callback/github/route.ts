import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

// GitHub OAuth callback. GitHub redirects here with ?code=...
// We exchange the code with our api-server, which returns a JWT.
// The JWT is stored in an httpOnly cookie, then we redirect to /dashboard.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/auth/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("api-server auth failed:", res.status, text);
      return NextResponse.redirect(
        new URL("/login?error=auth_failed", request.url),
      );
    }

    const data = (await res.json()) as { token: string };

    const cookieStore = await cookies();
    cookieStore.set(config.cookieName, data.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days, matches JWT TTL
      path: "/",
    });

    return NextResponse.redirect(new URL(next, request.url));
  } catch (e) {
    console.error("OAuth callback error:", e);
    return NextResponse.redirect(
      new URL("/login?error=callback_exception", request.url),
    );
  }
}