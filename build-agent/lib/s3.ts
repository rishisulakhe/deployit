import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "node:fs";
import * as path from "node:path";
import { lookup as mimeLookup } from "mime-types";
import { env } from "../env";

const isLocalStorage = env.S3_ARTIFACTS_BUCKET === "local";
const LOCAL_ARTIFACTS_ROOT = "/tmp/vercel-clone-artifacts";

const credentials =
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export const s3 = isLocalStorage
  ? null
  : new S3Client({
      region: env.AWS_REGION,
      ...(credentials ? { credentials } : {}),
    });

export interface UploadResult {
  files: number;
  bytes: number;
}

// Walks `dir` recursively and uploads every file under `${prefix}/<relpath>`
// to the artifacts bucket. Directories produce no objects. Result paths use
// POSIX separators regardless of host OS.
export async function uploadDirectory(opts: {
  dir: string;
  bucket: string;
  prefix: string;
  onProgress?: (info: { uploaded: number; totalFiles: number; lastKey: string }) => void;
}): Promise<UploadResult> {
  if (isLocalStorage) {
    return uploadLocal(opts);
  }
  return uploadS3(opts);
}

async function uploadLocal(opts: {
  dir: string;
  prefix: string;
  onProgress?: (info: { uploaded: number; totalFiles: number; lastKey: string }) => void;
}): Promise<UploadResult> {
  let files = 0;
  let bytes = 0;
  const collected: { filepath: string; key: string; size: number }[] = [];

  const walk = async (d: string): Promise<void> => {
    const entries = await fs.promises.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(opts.dir, abs).split(path.sep).join("/");
      const key = `${opts.prefix}${rel}`;
      const stat = await fs.promises.stat(abs);
      collected.push({ filepath: abs, key, size: stat.size });
      bytes += stat.size;
    }
  };

  await walk(opts.dir);
  let uploaded = 0;

  for (const item of collected) {
    const dest = path.join(LOCAL_ARTIFACTS_ROOT, item.key);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(item.filepath, dest);
    uploaded++;
    opts.onProgress?.({ uploaded, totalFiles: collected.length, lastKey: item.key });
  }

  files = collected.length;
  return { files, bytes };
}

async function uploadS3(opts: {
  dir: string;
  bucket: string;
  prefix: string;
  onProgress?: (info: { uploaded: number; totalFiles: number; lastKey: string }) => void;
}): Promise<UploadResult> {
  let files = 0;
  let bytes = 0;
  const collected: { filepath: string; key: string; size: number }[] = [];

  const walk = async (d: string): Promise<void> => {
    const entries = await fs.promises.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(opts.dir, abs).split(path.sep).join("/");
      const key = `${opts.prefix}${rel}`;
      const stat = await fs.promises.stat(abs);
      collected.push({ filepath: abs, key, size: stat.size });
      bytes += stat.size;
    }
  };

  await walk(opts.dir);
  let uploaded = 0;

  for (const item of collected) {
    const fileBuffer = await fs.promises.readFile(item.filepath);
    const ContentType = (mimeLookup(item.filepath) as string) || "application/octet-stream";
    await s3!.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: item.key,
        Body: fileBuffer,
        ContentType,
      }),
    );
    uploaded++;
    opts.onProgress?.({ uploaded, totalFiles: collected.length, lastKey: item.key });
  }

  files = collected.length;
  return { files, bytes };
}