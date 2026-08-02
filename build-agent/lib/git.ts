import { spawnStreaming, type LogCallback } from "./shell";

// `git clone --depth 1 --branch <branch> --single-branch <url> <target>`.
// We pass the URL with embedded credentials; stderr/stdout from git strip
// credentials from progress/error output, so relaying lines is safe.
export function cloneRepo({
  url,
  branch,
  target,
  onLog,
  onError,
}: {
  url: string;
  branch: string;
  target: string;
  onLog?: LogCallback;
  onError?: LogCallback;
}): Promise<void> {
  return spawnStreaming(
    "git",
    ["clone", "--depth", "1", "--branch", branch, "--single-branch", url, target],
    { onLog, onError },
  ).then((code) => {
    if (code !== 0) throw new Error(`git clone failed (exit ${code})`);
  });
}