// Build orchestrator worker.
//
// Phase 2 will implement: BRPOP build_queue -> ECS RunTask -> retry -> DLQ.
// For Phase 0 this is a runnable stub so the Bun entry point boots.

const QUEUE_NAME = process.env.BUILD_QUEUE ?? "build_queue";

console.log(`orchestrator starting (queue=${QUEUE_NAME})`);

setInterval(() => {
  // heartbeat so the process is visibly alive; replaced by BRPOP loop in Phase 2.
  console.log("orchestrator: waiting for build jobs...");
}, 5000);