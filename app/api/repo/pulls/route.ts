import { NextResponse } from "next/server";
import { DEFAULT_GITHUB_OWNER, isSafeRepositoryName } from "@/lib/github-projects";

const GITHUB_API = "https://api.github.com";

export async function GET(req: Request) {
  const repoName = new URL(req.url).searchParams.get("repo_name")?.trim() || "";
  if (!isSafeRepositoryName(repoName)) {
    return NextResponse.json({ error: "Invalid repository" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${GITHUB_API}/repos/${DEFAULT_GITHUB_OWNER}/${repoName}/pulls?state=open&per_page=5`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "subagent-aski",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: 30 },
      },
    );
  } catch {
    return NextResponse.json({ error: "GitHub PR list unavailable" }, { status: 502 });
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: response.status === 404 ? "Repository not found or not public" : "GitHub PR list unavailable" },
      { status: response.status === 404 ? 404 : 502 },
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json({ error: "Invalid GitHub PR response" }, { status: 502 });
  }
  if (!Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid GitHub PR response" }, { status: 502 });
  }

  return NextResponse.json(payload.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const pull = item as Record<string, unknown>;
    if (typeof pull.id !== "number" || !Number.isSafeInteger(pull.id) || pull.id <= 0) return [];
    if (typeof pull.number !== "number" || !Number.isSafeInteger(pull.number) || pull.number <= 0) return [];
    if (typeof pull.title !== "string" || !pull.title.trim() || pull.state !== "open") return [];
    return [{
      id: pull.id,
      number: pull.number,
      title: pull.title,
      state: "open",
      html_url: `https://github.com/${DEFAULT_GITHUB_OWNER}/${repoName}/pull/${pull.number}`,
    }];
  }));
}
