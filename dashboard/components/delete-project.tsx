"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientApi } from "@/lib/client-api";
import { Trash2, Loader2 } from "lucide-react";

export function DeleteProject({
  projectId,
  projectName,
  token,
}: {
  projectId: string;
  projectName: string;
  token: string;
}) {
  const router = useRouter();
  const api = clientApi(token);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const canDelete = confirmText === "delete";

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    await api.del(`/projects/${projectId}`);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        This action cannot be undone. Type{" "}
        <span className="font-mono font-semibold text-destructive">delete</span>{" "}
        to confirm deletion of <span className="font-medium">{projectName}</span>.
      </p>
      <div className="space-y-2">
        <Label htmlFor="confirm" className="sr-only">
          Type &quot;delete&quot; to confirm
        </Label>
        <Input
          id="confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='Type "delete"'
          className="max-w-xs"
        />
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        disabled={!canDelete || deleting}
        className="gap-2"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        {deleting ? "Deleting..." : "Delete project"}
      </Button>
    </div>
  );
}