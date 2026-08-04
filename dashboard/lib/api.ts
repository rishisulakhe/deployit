import { config } from "./config";
import { cookies } from "next/headers";

// Server-side API client. Reads the JWT from the cookie automatically and
// attaches it as a Bearer token. All calls go to the api-server.
//
// Usage in server components / route handlers:
//   const api = await apiClient()
//   const res = await api.get("/projects")
//

export async function apiClient() {
  const cookieStore = await cookies();
  const token = cookieStore.get(config.cookieName)?.value;

  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ status: number; data: T | null; error: string | null }> {
    const url = `${config.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data, error: res.ok ? null : text };
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "PATCH",
        body: body ? JSON.stringify(body) : undefined,
      }),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

