import { Hono } from "hono";
import { env } from "../../env";
import prisma from "../../lib/prisma";
import { encrypt } from "../../lib/kms";
import { signToken } from "../../lib/jwt";
import { registerCounter } from "../../lib/metrics";
import { logger } from "../../lib/logger";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const ghAuthCounter = registerCounter(
  "api_server_github_auth_total",
  "Total GitHub OAuth sign-ins",
);
const ghAuthErrCounter = registerCounter(
  "api_server_github_auth_errors_total",
  "Failed GitHub OAuth sign-ins",
);

export const auth = new Hono<AppEnv>();

auth.get("/github/.well-known", (c) =>
  c.json({
    clientId: env.GITHUB_CLIENT_ID,
    redirectUri: env.GITHUB_REDIRECT_URI,
    authorizeUrl:
      env.GITHUB_CLIENT_ID.length > 0
        ? `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(
            env.GITHUB_REDIRECT_URI,
          )}&scope=read:user repo user:email&prompt=consent`
        : null,
  }),
);

// POST /auth/github { code }  -> exchange code, upsert User, return session JWT.
auth.post("/github", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return c.json({ error: "missing_code" }, 400);

  // 1. Exchange code for GitHub access token.
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code: body.code,
      redirect_uri: env.GITHUB_REDIRECT_URI,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (tokenJson.error || !tokenJson.access_token) {
    ghAuthErrCounter.inc();
    logger.warn("github_exchange_failed", { detail: tokenJson.error });
    return c.json(
      { error: "github_exchange_failed", detail: tokenJson.error ?? "no_access_token" },
      502,
    );
  }
  const accessToken = tokenJson.access_token;

  // 2. Fetch the user profile.
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "vercel-clone",
    },
  });
  const userJson = (await userRes.json()) as {
    id?: number;
    login?: string;
    email?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
  };
  if (!userJson.id || !userJson.login) {
    ghAuthErrCounter.inc();
    return c.json({ error: "github_profile_fetch_failed" }, 502);
  }

  const email =
    userJson.email ?? `${userJson.login}@users.noreply.github.com`;
  const encryptedToken = await encrypt(Buffer.from(accessToken, "utf8"));

  // 3. Upsert user row.
  const user = await prisma.user.upsert({
    where: { githubId: userJson.id },
    create: {
      githubId: userJson.id,
      githubUsername: userJson.login,
      email,
      name: userJson.name ?? null,
      avatar: userJson.avatar_url ?? null,
      bio: userJson.bio ?? null,
      encryptedToken,
    },
    update: {
      githubUsername: userJson.login,
      email,
      name: userJson.name ?? null,
      avatar: userJson.avatar_url ?? null,
      bio: userJson.bio ?? null,
      encryptedToken,
    },
  });

  ghAuthCounter.inc();
  const token = await signToken({
    sub: user.id,
    githubUsername: user.githubUsername,
    githubId: user.githubId,
    email: user.email,
  });
  return c.json({ token, user: { id: user.id, githubUsername: user.githubUsername, email: user.email } });
});

auth.get("/me", requireAuth, (c) => {
  const u = c.get("user");
  return c.json({ user: u });
});