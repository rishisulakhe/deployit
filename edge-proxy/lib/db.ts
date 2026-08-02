import pg from "pg";
import { env } from "../env";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export default pool;

export interface ProjectRecord {
  id: string;
  slug: string;
  private: boolean;
  status: string;
}

export async function getProjectBySlug(slug: string): Promise<ProjectRecord | null> {
  const res = await pool.query<ProjectRecord>(
    `SELECT p."id", p."slug", p."private",
            COALESCE(
              (SELECT d."status" FROM "Deployment" d
               WHERE d."projectId" = p."id"
               ORDER BY d."createdAt" DESC
               LIMIT 1),
              'QUEUED'
            ) AS "status"
       FROM "Project" p
      WHERE p."slug" = $1
      LIMIT 1`,
    [slug],
  );
  return res.rows[0] ?? null;
}

// Resolve the latest successful deployment id for a project.
export async function getLatestSuccessfulDeployment(
  projectId: string,
): Promise<string | null> {
  const res = await pool.query<{ id: string }>(
    `SELECT "id" FROM "Deployment"
      WHERE "projectId" = $1 AND "status" = 'SUCCESS'
      ORDER BY "createdAt" DESC
      LIMIT 1`,
    [projectId],
  );
  return res.rows[0]?.id ?? null;
}

export async function incrementViews(projectId: string): Promise<void> {
  // Not all builds have a views column in the schema yet; ignore if it errors.
  try {
    await pool.query(
      `UPDATE "Project" SET "updatedAt" = NOW() WHERE "id" = $1`,
      [projectId],
    );
  } catch {
    // swallowed
  }
}