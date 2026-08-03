import { apiClient } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import type { Project } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DeleteProject } from "@/components/delete-project";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = await requireSession();
  const api = await apiClient();
  const { id } = await params;
  const { data } = await api.get<{ project: Project }>(`/projects/${id}`);
  const project = data?.project;

  if (!project) redirect("/dashboard");

  if (!project) redirect("/dashboard");

  return (
    <div className="max-w-2xl space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Project Name</span>
            <span>{project.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subdomain</span>
            <span className="font-mono text-xs">{project.slug}.app</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Repository</span>
            <span className="font-mono text-xs">
              {project.repoOwner}/{project.repoName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{new Date(project.createdAt).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            Delete Project
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteProject
            projectId={project.id}
            projectName={project.name}
            token={token}
          />
        </CardContent>
      </Card>
    </div>
  );
}