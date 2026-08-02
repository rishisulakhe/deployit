import * as fs from "node:fs";
import * as path from "node:path";
import { spawnStreaming, type LogCallback } from "./shell";

export type PackageManager = "npm" | "yarn" | "pnpm";

export function detectPackageManager(cwd: string): PackageManager {
  const has = (file: string) => fs.existsSync(path.join(cwd, file));
  if (has("pnpm-lock.yaml")) return "pnpm";
  if (has("yarn.lock")) return "yarn";
  return "npm";
}

export async function install({
  pm,
  cwd,
  onLog,
  onError,
}: {
  pm: PackageManager;
  cwd: string;
  onLog?: LogCallback;
  onError?: LogCallback;
}): Promise<void> {
  const cmd = pm === "yarn" ? "yarn" : pm; // npm / pnpm / yarn all named after themselves on PATH
  const args: string[] =
    pm === "yarn"
      ? ["install", "--frozen-lockfile"]
      : ["install", "--no-audit", "--no-fund"];

  const code = await spawnStreaming(cmd, args, { cwd, onLog, onError });
  if (code !== 0) {
    // Fall back to a non-frozen install if the lockfile is missing/old.
    if (args.includes("--frozen-lockfile")) {
      const retryArgs = ["install"];
      const retry = await spawnStreaming(cmd, retryArgs, { cwd, onLog, onError });
      if (retry !== 0) throw new Error(`${cmd} install failed (exit ${retry})`);
      return;
    }
    throw new Error(`${cmd} install failed (exit ${code})`);
  }
}

export async function runBuild({
  command,
  cwd,
  onLog,
  onError,
}: {
  command: string;
  cwd: string;
  onLog?: LogCallback;
  onError?: LogCallback;
}): Promise<void> {
  // Per project we get a string like "npm run build" or "vite build". Split
  // naively as shell argv. Quoting edge cases are out of scope here.
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error("empty_build_command");
  const [cmd, ...args] = tokens;
  if (!cmd) throw new Error("empty_build_command");
  const code = await spawnStreaming(cmd, args, { cwd, onLog, onError });
  if (code !== 0) throw new Error(`build command exited with ${code}`);
}