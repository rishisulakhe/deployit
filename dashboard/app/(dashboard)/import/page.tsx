import { requireSession } from "@/lib/auth";
import { ImportWizard } from "@/components/import-wizard";
import { config } from "@/lib/config";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    repo_owner?: string;
    repo_name?: string;
  }>;
}) {
  const token = await requireSession();
  const { repo_owner, repo_name } = await searchParams;

  if (!repo_owner || !repo_name) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Repository owner and name are required. Go back to{" "}
        <a href="/new" className="underline">
          the repo picker
        </a>
        .
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Import & Deploy</h1>
      <ImportWizard
        repoOwner={repo_owner}
        repoName={repo_name}
        token={token}
        apiBaseUrl={config.apiBaseUrl}
      />
    </div>
  );
}