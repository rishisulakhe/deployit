import express from "express";
import type { NextFunction, Request, Response } from "express";
import httpProxy from "http-proxy";
import type { IncomingMessage } from "node:http";
import { env } from "../env";
import { getProjectBySlug, getLatestSuccessfulDeployment, incrementViews } from "../lib/db";
import { cacheGet, cacheSet } from "../lib/redis";
import { logger } from "../lib/logger";
import { registerCounter, registerGauge, renderPrometheus } from "../lib/metrics";

const app = express();
const proxy = httpProxy.createProxy();

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

proxy.on("proxyRes", (proxyRes) => stripCloudHeaders(proxyRes as IncomingMessage));

// Health + metrics endpoints — served directly, not proxied.
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, service: "edge-proxy", ts: Date.now() }),
);

app.get("/metrics", (_req, res) =>
  res
    .type("text/plain; version=0.0.4")
    .send(renderPrometheus()),
);

app.use(async (req, res, next) => {
  activeReqs.inc();
  requests.inc();

  // Extract subdomain. With no real domain yet we accept *.localhost:8000
  // or `<slug>.<host>`; the first DNS label is the slug.
  const hostname = req.hostname;
  const subdomain = hostname.split(".")[0];

  if (!subdomain || subdomain === "localhost" || subdomain === "edge" || subdomain === "www") {
    activeReqs.dec();
    return res.status(404).json({ error: "missing_subdomain" });
  }

  // Cache lookup of project record.
  const cacheKey = `edge:slug:${subdomain}`;
  let record = await cacheGet<CachedRecord>(cacheKey);
  if (record) {
    cacheHits.inc();
  } else {
    cacheMisses.inc();
    const fromDb = await getProjectBySlug(subdomain);
    if (!fromDb) {
      misses404.inc();
      activeReqs.dec();
      if (env.EDGE_PROXY_NOT_FOUND_URL) {
        return proxy.web(req, res, {
          target: env.EDGE_PROXY_NOT_FOUND_URL,
          changeOrigin: true,
        });
      }
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
    if (env.EDGE_PROXY_NOT_FOUND_URL) {
      return proxy.web(req, res, {
        target: env.EDGE_PROXY_NOT_FOUND_URL,
        changeOrigin: true,
      });
    }
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

  const target = `${env.EDGE_PROXY_BACKEND_BASE_URL}/${record.id}/${deploymentId}`;
  // Inject /index.html for SPA-style root requests.
  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    activeReqs.dec();
    logger.error("proxy_web_error", {
      slug: subdomain,
      target,
      error: err.message,
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
app.listen(port, () => logger.info("edge_proxy_listening", { port }));

// Graceful shutdown of the pg pool so the process can exit promptly on SIGTERM.
process.on("SIGTERM", () => {
  logger.info("shutdown");
  import("../lib/db").then(({ default: pool }) => pool.end().then(() => process.exit(0)));
});