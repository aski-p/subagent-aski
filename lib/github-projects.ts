export const AGENT_ISSUE_PREFIX = "[Agent Office]";
const AGENT_MARKER_SOURCE = String.raw`<!--\s*agent-office:v1\b[^>]*-->`;

export function extractAgentOfficeMarkers(value: string): string[] {
  return value.match(new RegExp(AGENT_MARKER_SOURCE, "gi")) ?? [];
}
export const DEFAULT_GITHUB_OWNER = "aski-p";

const REPOSITORY_NAME = /^(?!\.)(?!.*\.\.)(?!.*\.git$)[A-Za-z0-9._-]{1,100}$/;

export type AgentRunStatus = "queued" | "planning" | "building" | "qa" | "blocked" | "done" | "unknown";

type GithubRepositoryCandidate = {
  owner?: { login?: unknown };
  name?: unknown;
  private?: unknown;
  archived?: unknown;
  fork?: unknown;
  has_issues?: unknown;
};

export function isSafeRepositoryName(value: string): boolean {
  return REPOSITORY_NAME.test(value);
}

export function normalizeGithubRepository(
  candidate: GithubRepositoryCandidate,
  expectedOwner = DEFAULT_GITHUB_OWNER,
): { owner: string; name: string } | null {
  const owner = candidate.owner?.login;
  const name = candidate.name;
  if (typeof owner !== "string" || owner !== expectedOwner) return null;
  if (typeof name !== "string" || !isSafeRepositoryName(name)) return null;
  if (candidate.private !== false || candidate.archived === true || candidate.fork === true || candidate.has_issues === false) return null;
  return { owner: expectedOwner, name };
}

export function buildAgentIssueUrl(input: { owner: string; repo: string; objective: string }): string {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const objective = input.objective.trim();
  if (owner !== DEFAULT_GITHUB_OWNER || !isSafeRepositoryName(repo)) {
    throw new Error("Unsupported GitHub repository");
  }
  if (!objective || objective.length > 4000) throw new Error("Objective must be between 1 and 4000 characters");
  if (extractAgentOfficeMarkers(objective).length > 0) throw new Error("Objective contains a reserved Agent Office marker");

  const titleObjective = objective.replace(/\s+/g, " ").slice(0, 180);
  const body = [
    "## Objective",
    objective,
    "",
    "## Agent pipeline",
    "Planner → Builder → QA",
    "",
    "## Safety contract",
    "- Work only in this repository.",
    "- Use an isolated branch/worktree.",
    "- Run the repository's tests and build before opening a PR.",
    "- Never merge, deploy, expose secrets, or perform destructive operations automatically.",
    "",
    `<!-- agent-office:v1 owner=${owner} repo=${repo} -->`,
  ].join("\n");

  const url = new URL(`https://github.com/${owner}/${repo}/issues/new`);
  url.searchParams.set("title", `${AGENT_ISSUE_PREFIX} ${titleObjective}`);
  url.searchParams.set("body", body);
  url.searchParams.set("labels", "agent-office:queued");
  return url.toString();
}

export function parseAgentRunStatus(labels: string[]): AgentRunStatus {
  const normalized = new Set(labels.map((label) => label.toLowerCase()));
  if (normalized.has("agent-office:blocked")) return "blocked";
  if (normalized.has("agent-office:done")) return "done";
  if (normalized.has("agent-office:qa")) return "qa";
  if (normalized.has("agent-office:building")) return "building";
  if (normalized.has("agent-office:planning")) return "planning";
  if (normalized.has("agent-office:queued")) return "queued";
  return "unknown";
}
