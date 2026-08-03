import Link from "next/link";
import { redirect } from "next/navigation";
import { apiClient } from "@/lib/api";
import type { Project } from "@/lib/types";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await apiClient();
  const { status, data } = await api.get<{ project: Project }>(
    `/projects/${id}`,
  );

  if (status === 401) redirect("/login");
  if (status === 404 || !data?.project) redirect("/dashboard");

  const project = data.project;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {project.repoOwner}/{project.repoName} · {project.branch}
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" asChild>
            <Link href={`/project/${id}/overview`}>Overview</Link>
          </TabsTrigger>
          <TabsTrigger value="deployments" asChild>
            <Link href={`/project/${id}/deployments`}>Deployments</Link>
          </TabsTrigger>
          <TabsTrigger value="settings" asChild>
            <Link href={`/project/${id}/settings`}>Settings</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div>{children}</div>
    </div>
  );
}