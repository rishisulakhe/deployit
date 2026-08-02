import { Hono } from "hono";
import type { AppEnv } from "../types";

// POST /webhooks/github
// Reserved for push-triggered auto-redeploys (Phase 3 extension). Body
// validation + signature verification wired up at that point.
export const webhooks = new Hono<AppEnv>();

webhooks.post("/github", (c) =>
  c.json({
    ok: true,
    message: "github_webhook_placeholder",
    note: "push auto-redeploy is a future scope item; manual deploys today.",
  }),
);