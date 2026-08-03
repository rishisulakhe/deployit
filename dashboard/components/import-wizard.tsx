"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { clientApi } from "@/lib/api";

export function ImportWizard({
  repoOwner,
  repoName,
  token,
  apiBaseUrl,
}: {
  repoOwner: string;
  repoName: string;
  token: string;
  apiBaseUrl: string;
}) {
  const router = useRouter();
  const api = clientApi(token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(repoName);
  const [slug, setSlug] = useState(
    repoName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
  );
  const [branch, setBranch] = useState("main");
  const [rootDir, setRootDir] = useState("");
  const [buildCommand, setBuildCommand] = useState("npm run build");
  const [buildDir, setBuildDir] = useState("dist");
  const [isPrivate, setIsPrivate] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await api.post<{ project?: { id: string }; error?: string }>(
      "/projects",
      {
        name,
        slug,
        repoOwner,
        repoName,
        branch,
        rootDir,
        buildCommand,
        buildDir,
        private: isPrivate,
        showOnHome: false,
      },
    );

    if (res.status === 201 && res.data?.project?.id) {
      // Trigger a deployment right away.
      await api.post(`/projects/${res.data.project.id}/deployments`);
      router.push(`/project/${res.data.project.id}/overview`);
    } else {
      setError(res.data?.error ?? "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repository</CardTitle>
          <CardDescription className="font-mono text-xs">
            {repoOwner}/{repoName}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Subdomain (slug)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  className="flex-1"
                  required
                />
                <span className="text-sm text-muted-foreground">.app</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rootDir">Root Directory (optional)</Label>
              <Input
                id="rootDir"
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                placeholder="/"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buildCommand">Build Command</Label>
              <Input
                id="buildCommand"
                value={buildCommand}
                onChange={(e) => setBuildCommand(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buildDir">Output Directory</Label>
              <Input
                id="buildDir"
                value={buildDir}
                onChange={(e) => setBuildDir(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visibility</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Switch
            id="private"
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
          <div>
            <Label htmlFor="private" className="text-sm">
              {isPrivate ? (
                <Badge variant="secondary">Private</Badge>
              ) : (
                <Badge>Public</Badge>
              )}
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Deploying..." : "Deploy"}
        </Button>
      </div>
    </form>
  );
}