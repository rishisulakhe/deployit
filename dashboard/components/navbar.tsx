import Link from "next/link";
import { cookies } from "next/headers";
import { config, githubAuthorizeUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { GitHubIcon } from "@/components/github-icon";
import { ThemeToggle } from "@/components/theme-toggle";

async function logoutAction() {
  "use server";
  const res = await fetch(`${config.apiBaseUrl}/auth/logout`, {
    method: "POST",
  });
  if (res.ok) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }
}

export async function Navbar() {
  const cookieStore = await cookies();
  const token = cookieStore.get(config.cookieName)?.value;
  const isLoggedIn = !!token;

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b px-6 backdrop-blur-sm bg-background/80">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="text-lg">▲</span>
        <span className="text-sm">Vercel Clone</span>
      </Link>

      <div className="flex items-center gap-3">
        <ThemeToggle />

        {isLoggedIn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">U</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dashboard">Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={logoutAction} className="contents">
                <DropdownMenuItem asChild>
                  <button type="submit" className="flex w-full items-center gap-2 text-destructive">
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <a href={githubAuthorizeUrl()}>
            <Button variant="ghost" size="sm" className="gap-2">
              <GitHubIcon className="h-4 w-4" />
              Sign in
            </Button>
          </a>
        )}
      </div>
    </header>
  );
}