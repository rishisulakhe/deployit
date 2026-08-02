import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (c) =>
  c.json({ ok: true, service: "api-server", ts: Date.now() }),
);

app.get("/metrics", (c) =>
  c.text(
    "# HELP api_server_up 1 when the api-server process is alive\n" +
      "# TYPE api_server_up gauge\n" +
      "api_server_up 1\n",
    200,
    { "Content-Type": "text/plain; version=0.0.4" },
  ),
);

app.all("*", (c) => c.json({ error: "Not Found" }, 404));

const port = Number(process.env.PORT ?? 3001);
Bun.serve({ port, fetch: app.fetch });
console.log(`api-server listening on :${port}`);