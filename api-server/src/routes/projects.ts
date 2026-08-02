import { Hono } from "hono";
import { z } from "zod";
import prisma from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { registerCounter } from "../../lib/metrics";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

const projectCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  repoOwner: z.string().min(1).max(100),
  repoName: z.string().min(1).max(100),
  branch: z.string().min(1).max(200),
  rootDir: z.string().max(500).default(""),
  buildCommand: z.string().max(500).default("npm run build"),
  buildDir: z.string().max(200).default("dist"),
  private: z.boolean().default(true),
  showOnHome: z.boolean().default(false),
});

const projectPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  private: z.boolean().optional(),
  showOnHome: z.boolean().optional(),
});

const projectsCreated = registerCounter(
  "api_server_projects_created_total",
  "Total projects created",
);

export const projects = new Hono<AppEnv>();
projects.use("*", requireAuth);

// GET /projects — list the signed-in user's projects.
projects.get("/projects", async (c) => {
  const user = c.get("user");
  const items = await prisma.project.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { deployments: true } },
    },
  });
  return c.json({ projects: items });
});

// Public listing: GET /projects/featured — projects flagged showOnHome+!private.
projects.get("/projects/featured", async (c) => {
  const items = await prisma.project.findMany({
    where: { showOnHome: true, private: false },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: {
      id: true,
      slug: true,
      name: true,
      repoOwner: true,
      repoName: true,
      branch: true,
    },
  });
  return c.json({ projects: items });
});

// POST /projects — create a project (does NOT yet deploy; deployments.crer).
projects.post("/projects", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      400,
    );
  const data = parsed.data;
  try {
    const project = await prisma.project.create({
      data: {
        ...data,
        userId: user.sub,
        rootDir: data.rootDir || undefined,
        buildCommand: data.buildCommand || undefined,
      },
    });
    projectsCreated.inc();
    logger.info("project_created", { id: project.id, slug: project.slug });
    return c.json({ project }, 201);
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      e.code === "P2002"
    ) {
      return c.json({ error: "slug_taken" }, 409);
    }
    throw e;
  }
});

// GET /projects/:id
projects.get("/projects/:id", async (c) => {
  const user = c.get("user");
  const project = await prisma.project.findFirst({
    where: { id: c.req.param("id"), userId: user.sub },
  });
  if (!project) return c.json({ error: "not_found" }, 404);
  return c.json({ project });
});

// PATCH /projects/:id
projects.patch("/projects/:id", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = projectPatchSchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      400,
    );
  const result = await prisma.project.updateMany({
    where: { id: c.req.param("id"), userId: user.sub },
    data: parsed.data,
  });
  if (result.count === 0) return c.json({ error: "not_found" }, 404);
  const updated = await prisma.project.findUnique({
    where: { id: c.req.param("id") },
  });
  return c.json({ project: updated });
});

// DELETE /projects/:id — soft cascade; FK relationships cascade at DB level.
projects.delete("/projects/:id", async (c) => {
  const user = c.get("user");
  const result = await prisma.project.deleteMany({
    where: { id: c.req.param("id"), userId: user.sub },
  });
  if (result.count === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});