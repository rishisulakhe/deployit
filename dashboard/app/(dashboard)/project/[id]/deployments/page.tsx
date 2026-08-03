import { apiClient } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { BuildLogs } from "@/components/build-logs";
import type { Deployment } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";

export default async function DeploymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = await requireSession();
  const api = await apiClient();
  const { id } = await params;

  const { data } = await api.get<{ deployments: Deployment[] }>(
    `/projects/${id}/deployments`,
  );
  const deployments = data?.deployments ?? [];

  if (deployments.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No deployments yet. Click &ldquo;Deploy&rdquo; on the overview page to
          create one.
        </CardContent>
      </Card>
    );
  }

  const latest = deployments[0]!;

  return (
    <div className="space-y-6">
      {/* Live logs for the latest deployment */}
      <BuildLogs deployment={latest} token={token} />

      {/* Deployment history */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">History</h3>
        {deployments.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    d.status === "SUCCESS"
                      ? "bg-green-500"
                      : d.status === "FAILED" || d.status === "TIMEOUT"
                        ? "bg-red-500"
                        : "bg-blue-500 animate-pulse"
                  }`}
                />
                <Badge variant="outline" className="text-xs">
                  {d.status}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {d.id.slice(0, 8)}
                </span>
                {d.attempt > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    retry {d.attempt}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {d.durationMs != null && <span>{(d.durationMs / 1000).toFixed(1)}s</span>}
                <span>{new Date(d.createdAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}