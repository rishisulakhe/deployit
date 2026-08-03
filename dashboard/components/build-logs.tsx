"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal, Download } from "lucide-react";
import type { Deployment } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  QUEUED: "bg-yellow-500",
  RUNNING: "bg-blue-500 animate-pulse",
  SUCCESS: "bg-green-500",
  FAILED: "bg-red-500",
  TIMEOUT: "bg-orange-500",
  CANCELLED: "bg-gray-500",
};

export function BuildLogs({
  deployment,
  token,
}: {
  deployment: Deployment;
  token: string;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Construct the SSE URL with the JWT as a query param (EventSource API
    // cannot set custom headers).
    const url = `${config.apiBaseUrl}/deployments/${deployment.id}/logs/stream?token=${token}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { line: string; stream: string };
        setLines((prev) => [...prev, data.line]);
      } catch {
        // comment lines like ": ping" arrive here too; ignore unparseable data
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [deployment.id, token]);

  // Auto-scroll to bottom when new lines arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const isDone =
    deployment.status === "SUCCESS" ||
    deployment.status === "FAILED" ||
    deployment.status === "TIMEOUT";

  function downloadLogs() {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `build-${deployment.id.slice(0, 8)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Build Logs</span>
          <span
            className={`h-2 w-2 rounded-full ${STATUS_COLORS[deployment.status] ?? "bg-gray-400"}`}
          />
          <Badge variant="outline" className="text-xs">
            {deployment.status}
          </Badge>
          {connected && !isDone && (
            <span className="text-xs text-muted-foreground">● live</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadLogs}
          disabled={lines.length === 0}
          className="gap-1"
        >
          <Download className="h-3 w-3" /> Download
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="h-96 overflow-auto bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300 dark:bg-black"
      >
        {lines.length === 0 && !connected ? (
          <p className="text-muted-foreground">Connecting...</p>
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground">Waiting for logs...</p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}