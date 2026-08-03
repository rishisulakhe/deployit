import { githubAuthorizeUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/github-icon";
import { Navbar } from "@/components/navbar";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto flex max-w-sm flex-col items-center justify-center gap-6 px-6 py-32">
        <div className="text-center">
          <span className="text-3xl">▲</span>
          <h1 className="mt-4 text-2xl font-semibold">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with GitHub to manage your deployments.
          </p>
        </div>

        <a href={githubAuthorizeUrl()} className="w-full">
          <Button size="lg" className="w-full gap-2">
            <GitHubIcon className="h-5 w-5" />
            Continue with GitHub
          </Button>
        </a>

        <ErrorNotice searchParams={searchParams} />
      </main>
    </div>
  );
}

async function ErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error) return null;

  const messages: Record<string, string> = {
    auth_failed: "Authentication failed. Please try again.",
    missing_code: "GitHub did not return an authorization code.",
    callback_exception: "An error occurred during sign-in.",
  };

  return (
    <p className="text-sm text-destructive">
      {messages[error] ?? "Unknown error."}
    </p>
  );
}