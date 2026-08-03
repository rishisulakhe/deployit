import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "./config";

export interface SessionUser {
  sub: string;
  githubUsername: string;
  githubId: number;
  email: string;
}

// Read the JWT from the httpOnly cookie set by the OAuth callback route.
// Returns null if the cookie is missing (caller should redirect to /login).
export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(config.cookieName);
  return cookie?.value ?? null;
}

// Returns the JWT, or redirects to /login if missing. The `redirect()` call
// throws internally so the function never returns normally when the token
// is absent — TS can't infer that, so we return an explicit fallback.
export async function requireSession(): Promise<string> {
  const token = await getSession();
  if (!token) {
    redirect("/login");
  }
  return token;
}