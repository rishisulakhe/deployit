import { NextResponse, type NextRequest } from "next/server";
import { config as appConfig } from "./lib/config";

// Next.js 16 renamed `middleware` to `proxy`. Protects dashboard routes by
// checking for the session cookie; redirects to /login if missing.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require auth.
  const publicPaths = ["/", "/login", "/api/auth/callback/github", "/api/auth/logout"];
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(appConfig.cookieName);
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};