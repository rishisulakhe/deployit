import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { decrypt } from "../../lib/kms";
import prisma from "../../lib/prisma";
import type { AppEnv } from "../types";

export const github = new Hono<AppEnv>();

github.get("/github/repos", requireAuth, async (c) => {
  const user = c.get("user");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
  });
  if (!dbUser || !dbUser.encryptedToken) {
    return c.json({ error: "no_github_token" }, 401);
  }

  const tokenBuf = await decrypt(dbUser.encryptedToken);
  const accessToken = Buffer.from(tokenBuf).toString("utf8");

  const res = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=100&type=owner",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "vercel-clone",
      },
    },
  );

  if (!res.ok) {
    return c.json(
      { error: "github_fetch_failed", detail: await res.text() },
      res.status as 400 | 401 | 403 | 404 | 500,
    );
  }

  const repos = (await res.json()) as Array<{
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    owner: { login: string };
  }>;

  return c.json({
    repos: repos.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      owner: { login: r.owner.login },
    })),
  });
});
