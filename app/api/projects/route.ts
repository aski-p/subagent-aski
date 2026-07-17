import { NextResponse } from "next/server";
import { DEFAULT_GITHUB_OWNER, normalizeGithubRepository } from "@/lib/github-projects";

const GITHUB_API = "https://api.github.com";

export async function GET() {
  const configuredOwner = process.env.GITHUB_OWNER?.trim();
  if (configuredOwner && configuredOwner !== DEFAULT_GITHUB_OWNER) {
    return NextResponse.json({ error: "Unsupported GitHub owner" }, { status: 503 });
  }
  const owner = DEFAULT_GITHUB_OWNER;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "subagent-aski",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const endpoint = `${GITHUB_API}/users/${owner}/repos?per_page=100&sort=updated`;
  let payload: unknown;
  try {
    const response = await fetch(endpoint, { headers, next: { revalidate: 60 } });
    if (!response.ok) {
      return NextResponse.json({ error: "GitHub project list unavailable" }, { status: 502 });
    }
    payload = await response.json();
  } catch {
    return NextResponse.json({ error: "GitHub project list unavailable" }, { status: 502 });
  }
  if (!Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid GitHub project response" }, { status: 502 });
  }

  const projects = payload.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const repo = item as Record<string, unknown> & { owner?: { login?: unknown } };
    const identity = normalizeGithubRepository({
      owner: repo.owner,
      name: repo.name,
      private: repo.private,
      archived: repo.archived,
      fork: repo.fork,
      has_issues: repo.has_issues,
    }, owner);
    if (!identity) return [];
    return [{
      ...identity,
      fullName: `${identity.owner}/${identity.name}`,
      private: false,
      description: typeof repo.description === "string" ? repo.description : "",
      defaultBranch: typeof repo.default_branch === "string" ? repo.default_branch : "main",
      updatedAt: typeof repo.updated_at === "string" ? repo.updated_at : "",
      htmlUrl: `https://github.com/${identity.owner}/${identity.name}`,
    }];
  });

  return NextResponse.json({ owner, projects });
}
