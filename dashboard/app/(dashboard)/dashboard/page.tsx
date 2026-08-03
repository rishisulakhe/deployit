import Link from "next/link";
import { apiClient } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { GitHubIcon } from "@/components/github-icon";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const token = await requireSession();
  const api = await apiClient();
  const { status, data } = await api.get<{ projects: Project[] }>("/projects");

  if (status === 401) {
    redirect("/login");
  }

  const projects = data?.projects ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center py-16">
            <GitHubIcon className="h-12 w-12 text-muted-foreground" />
            <CardTitle className="mt-4">No projects yet</CardTitle>
            <CardDescription>
              Import a GitHub repository to get started.
            </CardDescription>
            <Link href="/new">
              <Button className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Import your first project
              </Button>
            </Link>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/project/${p.id}/overview`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    {p.private ? (
                      <Badge variant="secondary">Private</Badge>
                    ) : (
                      <Badge>Public</Badge>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-2 font-mono text-xs">
                    <GitHubIcon className="h-3 w-3" />
                    {p.repoOwner}/{p.repoName}
                    <span className="text-muted-foreground">·</span>
                    {p.branch}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}