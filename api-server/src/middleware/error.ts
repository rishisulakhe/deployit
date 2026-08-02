import type { Context } from "hono";
import { logger } from "../../lib/logger";

export function errorHandler(err: Error, c: Context) {
  logger.error("unhandled_error", { error: err.message, stack: err.stack });
  return c.json({ error: "internal_error", message: err.message }, 500);
}