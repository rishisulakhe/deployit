// Bun.spawn wrapper that streams stdout/stderr line-by-line to callbacks.
// Used for both git clone and the user's `npm/pnpm/yarn install + build`.

export type LogCallback = (line: string) => void;

export function spawnStreaming(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; onLog?: LogCallback; onError?: LogCallback } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn({
        cmd: [cmd, ...args],
        cwd: opts.cwd ?? process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        env: opts.env ?? process.env as Record<string, string>,
      });
    } catch (e) {
      reject(e);
      return;
    }

    const decoder = new TextDecoder();

    const pump = async (stream: ReadableStream<Uint8Array> | null, cb?: LogCallback) => {
      if (!stream || !cb) return;
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        for (const line of text.split(/\r?\n/)) {
          if (line.length > 0) cb(line);
        }
      }
    };

    Promise.all([
      pump(proc.stdout as unknown as ReadableStream<Uint8Array>, opts.onLog),
      pump(proc.stderr as unknown as ReadableStream<Uint8Array>, opts.onError),
    ])
      .then(() => proc.exited)
      .then((code) => resolve(typeof code === "number" ? code : -1))
      .catch(reject);
  });
}