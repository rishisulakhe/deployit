import { requireSession } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import { RepoPicker } from "@/components/repo-picker";
import type { GitHubRepo } from "@/lib/types";

export default async function NewProjectPage() {
  const token = await requireSession();
  const api = await apiClient();

  let repos: GitHubRepo[] = [];
  let fetchError = false;

  try {
    const { status, data } = await api.get<{ repos?: GitHubRepo[] }>(
      "/github/repos",
    );
    if (status === 200) {
      repos = data?.repos ?? [];
    } else {
      fetchError = true;
    }
  } catch {
    fetchError = true;
  }

  if (fetchError) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">Import a Repository</h1>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Could not fetch your GitHub repositories. You can manually enter
            your repo details instead.
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

  if (repos.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold">Import a Repository</h1>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No repositories found. Create a repo on GitHub first, or manually
            enter your repo details.
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
