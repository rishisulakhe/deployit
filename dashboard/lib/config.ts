// Dashboard configuration — all values come from environment with sensible
// dev defaults. The api-server URL is used for both server-side and client-side
// API calls.

export const config = {
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:3001",
  github: {
    clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "",
    redirectUri:
      process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI ??
      "http://localhost:3000/api/auth/callback/github",
    scope: "read:user repo user:email",
  },
  cookieName: "vc_session",
  app: {
    name: "Vercel Clone",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  },
};

export function githubAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.redirectUri,
    scope: config.github.scope,
    prompt: "consent",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// Edge proxy URL where deployed projects live.
export const edgeProxyUrl =
  process.env.NEXT_PUBLIC_EDGE_PROXY_URL ?? "http://localhost:8000";