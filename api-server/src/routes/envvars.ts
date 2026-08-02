import { Hono } from "hono";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { encrypt } from "../../lib/kms";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const envVarSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  value: z.string().min(0).max(8192),
});

export const envvars = new Hono<AppEnv>();
envvars.use("*", requireAuth);

// GET /projects/:id/env-vars — list keys only (never expose decrypted values).
envvars.get("/projects/:id/env-vars", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), userId: user.sub },
    select: { id: true },
  });
  if (!project) return c.json({ error: "not_found" }, 404);
  const envVars = await prisma.envVar.findMany({
    where: { projectId: project.id },
    select: { id: true, key: true },
  });
  return c.json({ envVars });
});

// POST /projects/:id/env-vars { key, value } — create (encrypts value via KMS).
envvars.post("/projects/:id/env-vars", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), userId: user.sub },
    select: { id: true },
  });
  if (!project) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const parsed = envVarSchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      400,
    );
  const encryptedValue = await encrypt(Buffer.from(parsed.data.value, "utf8"));
  try {
    const ev = await prisma.envVar.create({
      data: {
        projectId: project.id,
        key: parsed.data.key,
        encryptedValue,
      },
    });
    return c.json({ envVar: { id: ev.id, key: ev.key } }, 201);
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      e.code === "P2002"
    ) {
      return c.json({ error: "duplicate_key" }, 409);
    }
    throw e;
  }
});

// DELETE /projects/:id/env-vars/:varId
envvars.delete("/projects/:id/env-vars/:varId", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), userId: user.sub },
    select: { id: true },
  });
  if (!project) return c.json({ error: "not_found" }, 404);
  const result = await prisma.envVar.deleteMany({
    where: { id: c.req.param("varId"), projectId: project.id },
  });
  if (result.count === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});