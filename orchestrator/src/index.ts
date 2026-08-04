import { env } from "./env";
import { blpopBuildQueue, rpush, queueDepth } from "./lib/redis";
import { updateDeploymentStatus } from "./lib/db";
import { runBuildTask, describeTask, stopTask } from "./lib/ecs";
import { buildJobSchema, type BuildJob } from "./lib/schemas";
import { logger } from "./lib/logger";
import {
  registerCounter,
  registerGauge,
  registerHistogram,
  renderPrometheus,
} from "./lib/metrics";

const jobsProcessed = registerCounter(
  "orchestrator_jobs_total",
  "Total build jobs processed",
);
const jobsSucceeded = registerCounter(
  "orchestrator_jobs_succeeded_total",
  "Jobs that ended in SUCCESS",
);
const jobsFailed = registerCounter(
  "orchestrator_jobs_failed_total",
  "Jobs that ended in FAILED after retries exhausted",
);
const jobsRetried = registerCounter(
  "orchestrator_jobs_retried_total",
  "Jobs re-enqueued for another attempt",
);
const ecsRunTaskErrors = registerCounter(
  "orchestrator_ecs_runtask_errors_total",
  "RunTask failures",
);
const buildDuration = registerHistogram(
  "orchestrator_build_duration_seconds",
  "Per-job wall-clock runtime in seconds",
);
const queueDepthGauge = registerGauge(
  "orchestrator_queue_depth",
  "Current depth of build_queue",
);

type BuildOutcome = "success" | "failed" | "timeout";

async function processJob(job: BuildJob): Promise<BuildOutcome> {
  await updateDeploymentStatus(job.deploymentId, "RUNNING");
  logger.info("deployment_started", {
    deploymentId: job.deploymentId,
    attempt: job.attempt,
    repoOwner: job.repoOwner,
    repoName: job.repoName,
    branch: job.branch,
  });

  // Don't echo REPO_URL — it contains the user's GitHub token.
  const repoUrl =
    `https://${job.githubToken}@github.com/${job.repoOwner}/${job.repoName}.git`;

  let taskArn: string;
  try {
    taskArn = await runBuildTask({
      deploymentId: job.deploymentId,
      projectId: job.projectId,
      slug: job.slug,
      repoUrl,
      branch: job.branch,
      rootDir: job.rootDir,
      buildCommand: job.buildCommand,
      buildDir: job.buildDir,
      userEnvVars: job.envVars,
    });
  } catch (e) {
    ecsRunTaskErrors.inc();
    logger.error("ecs_run_task_failed", {
      deploymentId: job.deploymentId,
      error: (e as Error).message,
    });
    return "failed";
  }

  await updateDeploymentStatus(job.deploymentId, "RUNNING", { ecsTaskArn: taskArn });

  const startedAt = Date.now();
  const pollIntervalMs = 2000;

  // Poll DescribeTasks until STOPPED or timeout.
  while (true) {
    await Bun.sleep(pollIntervalMs);

    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (
      env.ECS_BUILD_TIMEOUT_SECONDS > 0 &&
      elapsedSeconds >= env.ECS_BUILD_TIMEOUT_SECONDS
    ) {
      logger.warn("build_timeout", {
        deploymentId: job.deploymentId,
        elapsed: elapsedSeconds,
      });
      await stopTask(taskArn).catch(() => {});
      return "timeout";
    }

    let status;
    try {
      status = await describeTask(taskArn);
    } catch (e) {
      logger.warn("describe_task_failed", {
        taskArn,
        error: (e as Error).message,
      });
      continue;
    }
    if (!status) continue;

    if (status.state === "STOPPED") {
      const exitCode = status.exitCode;
      logger.info("task_stopped", {
        deploymentId: job.deploymentId,
        exitCode,
        stoppedReason: status.stoppedReason,
      });
      if (exitCode === 0) return "success";
      return "failed";
    }
  }
}

async function loop(): Promise<void> {
  logger.info("orchestrator_loop_started", { queue: env.BUILD_QUEUE, maxRetries: env.MAX_RETRIES });

  while (true) {
    let raw: string | null = null;
    try {
      raw = await blpopBuildQueue(5);
    } catch (e) {
      logger.error("blpop_error", { error: (e as Error).message });
      await Bun.sleep(1000);
      continue;
    }

    // Opportunistic gauge update so /metrics reflects backlog between jobs.
    queueDepthGauge.set(await queueDepth().catch(() => 0));

    if (!raw) continue;

    let job: BuildJob;
    try {
      const parsed = JSON.parse(raw);
      job = buildJobSchema.parse(parsed);
    } catch (e) {
      logger.error("invalid_job_message", {
        error: (e as Error).message,
        raw: raw.slice(0, 500),
      });
      continue;
    }

    jobsProcessed.inc();
    const start = Date.now();

    let outcome: BuildOutcome;
    try {
      outcome = await processJob(job);
    } catch (e) {
      logger.error("process_job_unhandled_error", {
        deploymentId: job.deploymentId,
        error: (e as Error).message,
        stack: (e as Error).stack,
      });
      outcome = "failed";
    }

    buildDuration.observe((Date.now() - start) / 1000);
    const endedAt = new Date();
    const durationMs = Date.now() - start;

    if (outcome === "success") {
      await updateDeploymentStatus(job.deploymentId, "SUCCESS", {
        endedAt,
        durationMs,
      }).catch((e) =>
        logger.warn("update_status_failed", { deploymentId: job.deploymentId, error: (e as Error).message }),
      );
      jobsSucceeded.inc();
      continue;
    }

    const nextAttempt = job.attempt + 1;
    if (nextAttempt < env.MAX_RETRIES) {
      jobsRetried.inc();
      logger.warn("job_retried", { deploymentId: job.deploymentId, attempt: nextAttempt });
      await rpush(env.BUILD_QUEUE, JSON.stringify({ ...job, attempt: nextAttempt }));
      continue;
    }

    // Retries exhausted: mark failed/timeout and move to DLQ for inspection.
    const terminalStatus = outcome === "timeout" ? "TIMEOUT" : "FAILED";
    await updateDeploymentStatus(job.deploymentId, terminalStatus, {
      endedAt,
      durationMs,
    }).catch(() => {});
    jobsFailed.inc();
    await rpush(
      env.BUILD_DLQ,
      JSON.stringify({ ...job, attempt: nextAttempt, lastResult: outcome }),
    ).catch((e) =>
      logger.error("dlq_push_failed", { deploymentId: job.deploymentId, error: (e as Error).message }),
    );
    logger.warn("job_dead_lettered", {
      deploymentId: job.deploymentId,
      lastResult: outcome,
      attempts: nextAttempt,
    });
  }
}

// /metrics + /healthz HTTP server on the orchestrator's own port (default 3003).
Bun.serve({
  port: env.PORT,
  fetch: (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/metrics" || url.pathname === "/") {
      return new Response(renderPrometheus(), {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }
    if (url.pathname === "/healthz") {
      return new Response(JSON.stringify({ ok: true, service: "orchestrator" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not_found", { status: 404 });
  },
});

loop().catch((e) => {
  logger.error("orchestrator_loop_crashed", {
    error: (e as Error).message,
    stack: (e as Error).stack,
  });
  process.exit(1);
});