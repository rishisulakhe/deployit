import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "../env";
import { publishLog, quit } from "../lib/redis";
import { cloneRepo } from "../lib/git";
import { install, runBuild, detectPackageManager } from "../lib/pm";
import { uploadDirectory } from "../lib/s3";
import { logger } from "../lib/logger";

const WORK_DIR = "/tmp/work";

async function main(): Promise<void> {
  const depId = env.DEPLOYMENT_ID;

  await publishLog(depId, "=== Build started ===");
  logger.info("build_started", {
    deploymentId: depId,
    projectId: env.PROJECT_ID,
    slug: env.SLUG,
    branch: env.BRANCH,
  });

  // Recreate an empty work dir.
  await fs.promises.rm(WORK_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(WORK_DIR, { recursive: true });

  // 1. Clone (depth-1, single branch).
  await publishLog(depId, `$ git clone --depth 1 --branch ${env.BRANCH}`);
  await cloneRepo({
    url: env.REPO_URL,
    branch: env.BRANCH,
    target: WORK_DIR,
    onLog: (line) => publishLog(depId, line),
    onError: (line) => publishLog(depId, line, "stderr"),
  });

  const rootDir = path.join(WORK_DIR, env.ROOT_DIR ?? "");
  if (!fs.existsSync(rootDir)) {
    throw new Error(`root_dir_not_found: ${env.ROOT_DIR ?? "/"}`);
  }

  // 2. Detect package manager.
  const pm = detectPackageManager(rootDir);
  await publishLog(depId, `Detected package manager: ${pm}`);

  // 3. Install dependencies.
  await publishLog(depId, `$ ${pm} install`);
  await install({ pm, cwd: rootDir,
    onLog: (line) => publishLog(depId, line),
    onError: (line) => publishLog(depId, line, "stderr"),
  });

  // 4. Build.
  await publishLog(depId, `$ ${env.BUILD_COMMAND}`);
  await runBuild({
    command: env.BUILD_COMMAND,
    cwd: rootDir,
    onLog: (line) => publishLog(depId, line),
    onError: (line) => publishLog(depId, line, "stderr"),
  });

  // 5. Upload build output to S3 under projects/<projectId>/<deploymentId>/.
  const buildDir = path.join(rootDir, env.BUILD_DIR);
  if (!fs.existsSync(buildDir)) {
    throw new Error(`build_output_dir_not_found: ${env.BUILD_DIR}`);
  }

  const s3Prefix =
    `${env.S3_ARTIFACTS_PREFIX}/${env.PROJECT_ID}/${env.DEPLOYMENT_ID}/`;

  await publishLog(depId, `Uploading ${buildDir} to s3://${env.S3_ARTIFACTS_BUCKET}/${s3Prefix}`);
  const stats = await uploadDirectory({
    dir: buildDir,
    bucket: env.S3_ARTIFACTS_BUCKET,
    prefix: s3Prefix,
    onProgress: ({ uploaded, totalFiles, lastKey }) => {
      if (uploaded % 10 === 0 || uploaded === totalFiles) {
        publishLog(depId, `uploaded ${uploaded}/${totalFiles} (${lastKey})`);
      }
    },
  });

  await publishLog(
    depId,
    `Uploaded ${stats.files} files (${stats.bytes} bytes) to s3://${env.S3_ARTIFACTS_BUCKET}/${s3Prefix}`,
  );
  await publishLog(depId, "=== Build complete ===");
  logger.info("build_complete", { deploymentId: depId });
}

main().then(async () => {
  await quit();
  process.exit(0);
}).catch(async (e) => {
  logger.error("build_failed", { error: (e as Error).message, stack: (e as Error).stack });
  await publishLog(env.DEPLOYMENT_ID, `=== Build failed: ${(e as Error).message} ===`, "stderr").catch(() => {});
  await quit();
  process.exit(1);
});