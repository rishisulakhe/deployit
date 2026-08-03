"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, GitBranch, ChevronRight } from "lucide-react";
import type { GitHubRepo } from "@/lib/types";

export function RepoPicker({ repos }: { repos: GitHubRepo[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No repositories found.
          </p>
        ) : (
          filtered.map((repo) => (
            <button
              key={repo.id}
              onClick={() =>
                router.push(
                  `/import?repo_owner=${repo.owner.login}&repo_name=${repo.name}`,
                )
              }
              className="w-full text-left"
            >
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{repo.full_name}</p>
                      {repo.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {repo.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </button>
          ))
        )}
      </div>
    </div>
  );
}