import { env } from "../env";

type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel = order[env.LOG_LEVEL];

function log(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (order[level] < minLevel) return;
  const out = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(out + "\n");
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => log("debug", msg, f),
  info:  (msg: string, f?: Record<string, unknown>) => log("info", msg, f),
  warn:  (msg: string, f?: Record<string, unknown>) => log("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => log("error", msg, f),
};