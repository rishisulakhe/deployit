// Types shared across the dashboard for API responses.

export interface Project {
  id: string;
  name: string;
  slug: string;
  userId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  rootDir: string | null;
  buildCommand: string | null;
  buildDir: string | null;
  private: boolean;
  showOnHome: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { deployments: number };
}

export interface Deployment {
  id: string;
  projectId: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "CANCELLED";
  attempt: number;
  ecsTaskArn: string | null;
  size: string | null;
  durationMs: number | null;
  createdAt: string;
  endedAt: string | null;
}

export interface BuildLogEntry {
  line: string;
  stream: string;
  ts: string | number;
}

export interface EnvVar {
  id: string;
  key: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: { login: string };
  default_branch: string;
}