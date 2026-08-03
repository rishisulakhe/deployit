import { requireSession } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import { RepoPicker } from "@/components/repo-picker";
import type { GitHubRepo } from "@/lib/types";
import { redirect } from "next/navigation";

export default async function NewProjectPage() {
  const token = await requireSession();
  const api = await apiClient();

  // Fetch repos from the api-server. The api-server uses the user's stored
  // GitHub token to call the GitHub API. If this endpoint isn't implemented yet,
  // we show a placeholder.
  let repos: GitHubRepo[] = [];
  try {
    const { status, data } = await api.get<{ repos?: GitHubRepo[] }>("/github/repos");
    if (status === 200) {
      repos = data?.repos ?? [];
    }
  } catch {
    // endpoint not yet implemented — show empty state
  }

  if (repos.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">Import a Repository</h1>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            The GitHub repos endpoint is coming in Phase 3. For now, you can
            manually enter your repo details in the import wizard.
          </p>
          <a
            href="/import?repo_owner=your-username&repo_name=your-repo"
            className="mt-4 inline-block"
          >
            <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
              Manual import →
            </button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Import a Repository</h1>
      <RepoPicker repos={repos} />
    </div>
  );
}