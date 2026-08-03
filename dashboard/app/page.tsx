import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, GitBranch, Globe } from "lucide-react";
import { GitHubIcon } from "@/components/github-icon";
import { Navbar } from "@/components/navbar";
import { githubAuthorizeUrl } from "@/lib/config";

export default function LandingPage() {
  return (
    <div className="min-h-svh">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-20">
        <div className="flex flex-col items-center text-center gap-8">
          <span className="text-5xl">▲</span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Deploy in seconds,
            <br />
            <span className="text-muted-foreground">not hours.</span>
          </h1>
          <p className="max-w-lg text-lg text-muted-foreground">
            A self-hosted deployment platform that builds your git repos and
            serves them on subdomains. Powered by AWS, built for developers.
          </p>
          <div className="flex gap-4">
            <a href={githubAuthorizeUrl()}>
              <Button size="lg" className="gap-2">
                <GitHubIcon className="h-5 w-5" />
                Get Started
              </Button>
            </a>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="gap-2">
                Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
            <FeatureCard
              icon={<Zap className="h-8 w-8" />}
              title="Instant Deploys"
              desc="Push to your repo, and your project builds as an ECS Fargate task with zero cold-start servers."
            />
            <FeatureCard
              icon={<GitBranch className="h-8 w-8" />}
              title="Git-Powered"
              desc="Connect any GitHub repo. We clone, build, and serve — no config files required."
            />
            <FeatureCard
              icon={<Globe className="h-8 w-8" />}
              title="Custom Domains"
              desc="Every project gets a subdomain. CloudFront CDN + S3 for delivery."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}