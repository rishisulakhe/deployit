import pg from "pg";
import { env } from "../env";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export default pool;

export interface DeploymentStatusUpdate {
  ecsTaskArn?: string;
  endedAt?: Date;
  durationMs?: number;
}

export async function updateDeploymentStatus(
  id: string,
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "CANCELLED",
  fields?: DeploymentStatusUpdate,
): Promise<void> {
  const sets: string[] = ['"status" = $2'];
  const values: unknown[] = [id, status];
  let i = 3;
  if (fields?.ecsTaskArn !== undefined) {
    sets.push(`"ecsTaskArn" = $${i++}`);
    values.push(fields.ecsTaskArn);
  }
  if (fields?.endedAt !== undefined) {
    sets.push(`"endedAt" = $${i++}`);
    values.push(fields.endedAt);
  }
  if (fields?.durationMs !== undefined) {
    sets.push(`"durationMs" = $${i++}`);
    values.push(fields.durationMs);
  }
  await pool.query(
    `UPDATE "Deployment" SET ${sets.join(", ")} WHERE "id" = $1`,
    values,
  );
}

export async function insertBuildLog(
  deploymentId: string,
  line: string,
  stream: "stdout" | "stderr",
): Promise<void> {
  await pool.query(
    'INSERT INTO "BuildLog" ("id", "deploymentId", "line", "stream", "ts") VALUES (gen_random_uuid(), $1, $2, $3, NOW())',
    [deploymentId, line, stream],
  );
}