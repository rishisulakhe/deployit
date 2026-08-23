import express from "express";
import type { NextFunction, Request, Response } from "express";
import httpProxy from "http-proxy";
import type { IncomingMessage } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../env";
import { getProjectBySlug, getLatestSuccessfulDeployment, incrementViews } from "../lib/db";
import { cacheGet, cacheSet } from "../lib/redis";
import { logger } from "../lib/logger";
import { registerCounter, registerGauge, renderPrometheus } from "../lib/metrics";

const app = express();
const proxy = httpProxy.createProxy({ selfHandleResponse: true });

// S3 client for serving artifacts when no local files exist
const s3Credentials = env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
  ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
  : undefined;
const s3 = env.S3_ARTIFACTS_BUCKET
  ? new S3Client({ region: env.AWS_REGION, ...(s3Credentials ? { credentials: s3Credentials } : {}) })
  : null;

const requests = registerCounter("edge_proxy_requests_total", "Total proxied requests");
const cacheHits = registerCounter("edge_proxy_cache_hits_total", "Subdomain cache hits");
const cacheMisses = registerCounter("edge_proxy_cache_misses_total", "Subdomain cache misses");
const misses404 = registerCounter("edge_proxy_not_found_total", "Subdomain not-found / private / unbuilt");
const activeReqs = registerGauge("edge_proxy_active_requests", "Concurrent requests in flight");

interface CachedRecord {
  id: string;
  private: boolean;
  status: string;
}

const LOCAL_ARTIFACTS_ROOT = "/tmp/vercel-clone-artifacts";
const isLocalMode = !env.EDGE_PROXY_BACKEND_BASE_URL || env.EDGE_PROXY_BACKEND_BASE_URL === "local";

// AWS / cloud headers we scrub from upstream responses so the deployed apps
// look like they're served by us, not by their underlying CDN/object store.
const SCRUB_HEADER_PREFIXES = [
  "x-amz",
  "x-ms",
  "x-cloudfront",
  "x-cache",
  "via",
  "age",
  "etag",
  "x-amz-id",
];

function stripCloudHeaders(proxyRes: IncomingMessage): void {
  for (const header of Object.keys(proxyRes.headers)) {
    if (SCRUB_HEADER_PREFIXES.some((p) => header.toLowerCase().startsWith(p))) {
      delete proxyRes.headers[header];
    }
  }
  proxyRes.headers["server"] = "vercel-clone-edge";
  proxyRes.headers["x-powered-by"] = "vercel-clone";
}

// Vite / webpack static builds emit root-absolute asset URLs in index.html
// (e.g. src="/assets/index-<hash>.js"). Under path-based routing the app is
// served at /<slug>/ so those requests would hit the proxy WITHOUT the slug
// prefix and get misrouted. Rewrite them to /<slug>/... so they resolve.
function rewriteHtmlPaths(html: string, basePath: string): string {
  if (!basePath) return html;
  return html.replace(
    /((?:src|href|action)=["'])\//g,
    `$1${basePath}/`,
  );
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml",
    ".map": "application/json",
  };
  return types[ext] ?? "application/octet-stream";
}

proxy.on("proxyRes", (proxyRes, req, res) => {
  stripCloudHeaders(proxyRes as IncomingMessage);

  const basePath = (req as Request & { __edgeBasePath?: string }).__edgeBasePath ?? "";
  const isHtml = (proxyRes.headers["content-type"] ?? "").includes("text/html");

  if (basePath && isHtml) {
    // Buffer the upstream HTML so we can rewrite root-absolute asset paths.
    const chunks: Buffer[] = [];
    proxyRes.on("data", (c: Buffer) => chunks.push(c));
    proxyRes.on("end", () => {
      const html = Buffer.concat(chunks).toString("utf-8");
      const rewritten = rewriteHtmlPaths(html, basePath);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Length", Buffer.byteLength(rewritten));
      res.end(rewritten);
    });
    return;
  }

  res.writeHead((proxyRes as IncomingMessage).statusCode ?? 200, proxyRes.headers);
  (proxyRes as IncomingMessage).pipe(res);
});

// Health + metrics endpoints — served directly, not proxied.
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, service: "edge-proxy", ts: Date.now() }),
);

app.get("/metrics", (_req, res) =>
  res
    .type("text/plain; version=0.0.4")
    .send(renderPrometheus()),
);

// ── Static file serving (local + S3) ──────────────────────────────────────────

async function serveArtifact(req: Request, res: Response, projectId: string, deploymentId: string, basePath: string) {
  const fullUrlPath = req.url.split("?")[0] || "/";
  const relPath = fullUrlPath === "/" || fullUrlPath === ""
    ? "/index.html"
    : fullUrlPath;

  const localDir = path.join(LOCAL_ARTIFACTS_ROOT, "projects", projectId, deploymentId);
  const filePath = path.join(localDir, relPath);

  const readHtml = (html: string): string => {
    return basePath ? rewriteHtmlPaths(html, basePath) : html;
  };

  // Prevent directory traversal.
  if (!filePath.startsWith(localDir)) {
    return res.status(403).send("forbidden");
  }

  // Try local filesystem first
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const indexFile = path.join(filePath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(readHtml(fs.readFileSync(indexFile, "utf-8")));
      }
    } else if (stat.isFile()) {
      if (path.extname(filePath).toLowerCase() === ".html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(readHtml(fs.readFileSync(filePath, "utf-8")));
      }
      res.setHeader("Content-Type", guessContentType(filePath));
      return res.send(fs.readFileSync(filePath));
    }
  } catch {
    // Local file not found, try S3 below
  }

  // Try S3 if bucket is configured
  if (s3 && env.S3_ARTIFACTS_BUCKET) {
    const s3Key = `${env.S3_ARTIFACTS_PREFIX}/${projectId}/${deploymentId}${relPath}`;
    try {
      const command = new GetObjectCommand({
        Bucket: env.S3_ARTIFACTS_BUCKET,
        Key: s3Key,
      });
      const response = await s3.send(command);
      const body = await response.Body?.transformToByteArray();
      if (body) {
        const contentType = guessContentType(relPath);
        if (relPath.endsWith(".html")) {
          const html = new TextDecoder().decode(body);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.send(readHtml(html));
        }
        res.setHeader("Content-Type", contentType);
        return res.send(Buffer.from(body));
      }
    } catch (s3Err) {
      // Try SPA fallback from S3
      if (relPath !== "/index.html") {
        try {
          const spaKey = `${env.S3_ARTIFACTS_PREFIX}/${projectId}/${deploymentId}/index.html`;
          const spaCommand = new GetObjectCommand({
            Bucket: env.S3_ARTIFACTS_BUCKET,
            Key: spaKey,
          });
          const spaResponse = await s3.send(spaCommand);
          const spaBody = await spaResponse.Body?.transformToByteArray();
          if (spaBody) {
            const html = new TextDecoder().decode(spaBody);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.send(readHtml(html));
          }
        } catch {
          // SPA fallback not found
        }
      }
    }
  }

  // Local SPA fallback
  const spaFallback = path.join(localDir, "index.html");
  if (fs.existsSync(spaFallback)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(readHtml(fs.readFileSync(spaFallback, "utf-8")));
  }

  return res.status(404).send("File not found");
}

app.use(async (req, res, next) => {
  activeReqs.inc();
  requests.inc();

  const hostname = req.hostname;
  const urlPath = req.path;

  // Determine slug from subdomain OR path prefix.
  // Subdomain mode: "my-slug.localhost:8000/" → slug = "my-slug"
  // Path mode: "localhost:8000/my-slug/" → slug = "my-slug"
  let subdomain = hostname.split(".")[0] ?? "";
  const skipSubdomains = ["localhost", "edge", "www", "127", "0", ""];

  let slug: string;
  // basePath is the path prefix that route-based routing consumes
  // (e.g. "/my-slug"). Empty in subdomain mode where the app sits at domain root.
  let basePath = "";

  if (!skipSubdomains.includes(subdomain)) {
    slug = subdomain;
  } else {
    const segments = urlPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      activeReqs.dec();
      return res.status(404).json({ error: "missing_subdomain" });
    }
    slug = segments[0]!;
    basePath = "/" + slug;
    req.url = "/" + segments.slice(1).join("/") + (req.url.includes("?") ? "?" + req.url.split("?")[1] : "");
  }

  // Cache lookup of project record.
  const cacheKey = `edge:slug:${slug}`;
  let record = await cacheGet<CachedRecord>(cacheKey);
  if (record) {
    cacheHits.inc();
  } else {
    cacheMisses.inc();
    const fromDb = await getProjectBySlug(slug);
    if (!fromDb) {
      misses404.inc();
      activeReqs.dec();
      return res.status(404).send("Project not found");
    }
    record = {
      id: fromDb.id,
      private: fromDb.private,
      status: fromDb.status,
    };
    await cacheSet(cacheKey, record);
  }

  // Block private or unbuilt projects at the edge.
  if (record.private || record.status !== "SUCCESS") {
    misses404.inc();
    activeReqs.dec();
    return res.status(404).send("Project not available");
  }

  // Find the latest successful deployment for this project (also cached).
  const deploymentCacheKey = `edge:latest-deploy:${record.id}`;
  let deploymentId = await cacheGet<string>(deploymentCacheKey);
  if (!deploymentId) {
    deploymentId = await getLatestSuccessfulDeployment(record.id);
    if (!deploymentId) {
      misses404.inc();
      activeReqs.dec();
      return res.status(404).send("No successful deployment yet");
    }
    await cacheSet(deploymentCacheKey, deploymentId, env.EDGE_PROXY_CACHE_TTL);
  }

  // Fire-and-forget view counter (do not block the request).
  incrementViews(record.id).catch(() => {});

  if (isLocalMode) {
    // Serve from local filesystem.
    activeReqs.dec();
    return serveArtifact(req as Request, res, record.id, deploymentId, basePath);
  }

  // Proxy to CloudFront/S3.
  (req as Request & { __edgeBasePath?: string }).__edgeBasePath = basePath;
  const target = `${env.EDGE_PROXY_BACKEND_BASE_URL}/projects/${record.id}/${deploymentId}`;

  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    activeReqs.dec();
    logger.error("proxy_web_error", {
      slug,
      target,
      error: (err as Error).message,
    });
    if (!res.headersSent) res.status(502).send("upstream_error");
  });
});

proxy.on("proxyReq", (proxyReq, req) => {
  const u = req.url ?? "";
  if (u === "/" || u === "") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (proxyReq as any).path = (proxyReq as any).path.replace(/\/$/, "") + "/index.html";
  }
});

app.use((req: Request, res: Response, _next: NextFunction) => {
  activeReqs.dec();
  if (!res.headersSent) res.status(404).json({ error: "not_found" });
});

const port = env.EDGE_PROXY_PORT;
app.listen(port, () => {
  logger.info("edge_proxy_listening", { port, mode: isLocalMode ? "local" : "proxy", backend: env.EDGE_PROXY_BACKEND_BASE_URL });
});

// Graceful shutdown of the pg pool so the process can exit promptly on SIGTERM.
process.on("SIGTERM", () => {
  logger.info("shutdown");
  import("../lib/db").then(({ default: pool }) => pool.end().then(() => process.exit(0)));
});