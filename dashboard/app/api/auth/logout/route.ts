import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

// Clears the session cookie and redirects to the landing page.
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(config.cookieName);
  return NextResponse.json({ ok: true });
}