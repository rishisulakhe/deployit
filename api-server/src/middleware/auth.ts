import { createMiddleware } from "hono/factory";
import { verifyToken } from "../../lib/jwt";
import type { AppEnv } from "../types";

// Accepts `Authorization: Bearer <token>` OR `?token=<token>` (the latter
// because the SSE EventSource API can't send custom headers).
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  let token: string | undefined;
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7);
  } else {
    token = c.req.query("token");
  }
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try {
    const user = await verifyToken(token);
    c.set("user", user);
  } catch {
    return c.json({ error: "invalid_token" }, 401);
  }
  await next();
});