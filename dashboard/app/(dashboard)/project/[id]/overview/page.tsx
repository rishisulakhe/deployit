import { apiClient } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { config, edgeProxyUrl } from "@/lib/config";
import { DeployButton } from "@/components/deploy-button";
import type { Project, Deployment } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { GitHubIcon } from "@/components/github-icon";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = await requireSession();
  const api = await apiClient();
  const { id } = await params;

  const { data: projectRes } = await api.get<{ project: Project }>(
    `/projects/${id}`,
  );
  const project = projectRes?.project;
  if (!project) return null;

  const { data: depRes } = await api.get<{ deployments: Deployment[] }>(
    `/projects/${id}/deployments`,
  );
  const deployments = depRes?.deployments ?? [];
  const latest = deployments[0] ?? null;

  const deployedUrl = `${edgeProxyUrl}/${project.id}/${latest?.id ?? "pending"}`;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Deploy summary */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Production</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {latest && (
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    latest.status === "SUCCESS"
                      ? "bg-green-500"
                      : latest.status === "FAILED" || latest.status === "TIMEOUT"
                        ? "bg-red-500"
                        : "bg-blue-500 animate-pulse"
                  }`}
                />
              )}
              <Badge variant="outline">{latest?.status ?? "No deploys yet"}</Badge>
            </div>
            <DeployButton
              projectId={project.id}
              token={token}
              apiBaseUrl={config.apiBaseUrl}
            />
          </div>

          {latest?.status === "SUCCESS" && (
            <a href={deployedUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Visit {project.slug}.app
              </Button>
            </a>
          )}
        </CardContent>
      </Card>

      {/* Project info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <InfoRow label="Repository" value={`${project.repoOwner}/${project.repoName}`} icon={<GitHubIcon className="h-3 w-3" />} />
          <InfoRow label="Branch" value={project.branch} />
          <InfoRow label="Root Dir" value={project.rootDir || "/"} />
          <InfoRow label="Build Cmd" value={project.buildCommand || "npm run build"} />
          <InfoRow label="Output Dir" value={project.buildDir || "dist"} />
          <InfoRow label="Visibility" value={project.private ? "Private" : "Public"} />
          <InfoRow
            label="Created"
            value={new Date(project.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-xs">
        {icon}
        {value}
      </span>
    </div>
  );
}