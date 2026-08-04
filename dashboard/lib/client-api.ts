import { config } from "./config";

// Client-side API client for use in "use client" components.
// Pass the JWT explicitly (read from a prop or context). Used by deploy buttons,
// delete dialogs, SSE log streams, etc.
export function clientApi(token: string) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ status: number; data: T | null }> {
    const url = `${config.apiBaseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers as Record<string, string>),
      },
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data };
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
