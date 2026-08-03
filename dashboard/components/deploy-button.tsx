"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Rocket, Loader2 } from "lucide-react";
import { clientApi } from "@/lib/api";

export function DeployButton({
  projectId,
  token,
}: {
  projectId: string;
  token: string;
  apiBaseUrl: string;
}) {
  const router = useRouter();
  const api = clientApi(token);
  const [deploying, setDeploying] = useState(false);

  async function handleDeploy() {
    setDeploying(true);
    await api.post(`/projects/${projectId}/deployments`);
    router.refresh();
    setDeploying(false);
  }

  return (
    <Button onClick={handleDeploy} disabled={deploying} className="gap-2">
      {deploying ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Rocket className="h-4 w-4" />
      )}
      {deploying ? "Queuing..." : "Deploy"}
    </Button>
  );
}