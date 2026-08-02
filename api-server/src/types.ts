import type { JwtPayload } from "../lib/jwt";

// Shared Hono env type — declares the `user` session variable populated by
// the `requireAuth` middleware and read by route handlers via `c.get("user")`.
export type AppEnv = {
  Variables: {
    user: JwtPayload;
  };
};