import { NextResponse } from "next/server";
import {
  AGENT_ISSUE_PREFIX,
  DEFAULT_GITHUB_OWNER,
  extractAgentOfficeMarkers,
  isSafeRepositoryName,
  parseAgentRunStatus,
} from "@/lib/github-projects";

const GITHUB_API = "https://api.github.com";

type RouteContext = { params: Promise<{ repo: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { repo } = await context.params;
  const configuredOwner = process.env.GITHUB_OWNER?.trim();
  const owner = DEFAULT_GITHUB_OWNER;
  if ((configuredOwner && configuredOwner !== owner) || !isSafeRepositoryName(repo)) {
    return NextResponse.json({ error: "Invalid repository" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "subagent-aski",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const endpoint = `${GITHUB_API}/repos/${owner}/${repo}/issues?state=all&creator=${owner}&per_page=30&sort=updated`;
  let response: Response;
  try {
    response = await fetch(endpoint, { headers, next: { revalidate: 30 } });
  } catch {
    return NextResponse.json({ error: "GitHub run list unavailable" }, { status: 502 });
  }
  if (!response.ok) {
    return NextResponse.json({ error: response.status === 404 ? "Repository not found" : "GitHub run list unavailable" }, { status: response.status === 404 ? 404 : 502 });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json({ error: "Invalid GitHub run response" }, { status: 502 });
  }
  if (!Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid GitHub run response" }, { status: 502 });
  }

  const runs = payload.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const issue = item as Record<string, unknown> & {
      user?: { login?: unknown };
      labels?: Array<string | { name?: unknown }>;
    };
    if (issue.pull_request || typeof issue.title !== "string" || !issue.title.startsWith(AGENT_ISSUE_PREFIX)) return [];
    if (issue.user?.login !== owner || typeof issue.body !== "string") return [];
    if (!Number.isSafeInteger(issue.id) || (issue.id as number) <= 0 || !Number.isSafeInteger(issue.number) || (issue.number as number) <= 0) return [];
    if (issue.state !== "open" && issue.state !== "closed") return [];
    const expectedMarker = `<!-- agent-office:v1 owner=${owner} repo=${repo} -->`;
    const markers = extractAgentOfficeMarkers(issue.body);
    if (markers.length !== 1 || markers[0] !== expectedMarker) return [];
    const labels = Array.isArray(issue.labels)
      ? issue.labels.flatMap((label) => typeof label === "string" ? [label] : typeof label?.name === "string" ? [label.name] : [])
      : [];
    const durableLabels = labels
      .map((label) => label.toLowerCase())
      .filter((label) => [
        "agent-office:queued",
        "agent-office:planning",
        "agent-office:building",
        "agent-office:qa",
        "agent-office:blocked",
        "agent-office:done",
      ].includes(label));
    if (durableLabels.length !== 1) return [];
    const status = parseAgentRunStatus(durableLabels);
    if (status === "unknown" || (issue.state === "closed" && status !== "done")) return [];
    const title = issue.title.slice(AGENT_ISSUE_PREFIX.length).trim();
    if (!title) return [];
    return [{
      id: issue.id as number,
      number: issue.number as number,
      title,
      status,
      labels,
      url: `https://github.com/${owner}/${repo}/issues/${issue.number as number}`,
      updatedAt: typeof issue.updated_at === "string" ? issue.updated_at : "",
      closed: issue.state === "closed",
    }];
  });

  return NextResponse.json({ owner, repo, runs });
}
