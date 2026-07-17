# Agent Office GitHub Worker Contract

## Scope

The deployed web app is a public-repository intake and status UI. GitHub issues are the durable queue. Hermes workers run outside Vercel and poll GitHub outbound; Vercel never receives runner credentials and never calls a private runner.

Supported repository boundary:

- owner and issue author must equal canonical `aski-p` case-sensitively;
- title must begin with `[Agent Office]`;
- the body must contain exactly one marker-like comment matching case-insensitive `<!--\s*agent-office:v1\b[^>]*-->`;
- that sole marker must exactly equal `<!-- agent-office:v1 owner=aski-p repo=<repo> -->`;
- the objective must not contain a reserved marker-like comment;
- exactly one durable `agent-office:*` state-label occurrence is allowed after case normalization; duplicates and conflicts are invalid;
- repository name must pass `lib/github-projects.ts` validation;
- one deterministic branch per issue: `agent-office/issue-<number>`;
- one canonical pull request per branch.

Anything outside that boundary is ignored, not guessed.

## Durable states

| Label | Owner | Meaning |
|---|---|---|
| `agent-office:queued` | Intake | Waiting for Planner |
| `agent-office:planning` | Planner | Repository inspection and bounded plan in progress |
| `agent-office:building` | Builder | Isolated implementation/test/PR work in progress |
| `agent-office:qa` | QA | PR and acceptance criteria verification in progress |
| `agent-office:blocked` | Any | Human input or safe infrastructure is required |
| `agent-office:done` | QA | PR passed QA; merge/deploy remains manual |

Workers move exactly one issue per invocation and add an idempotent HTML marker to their GitHub comment. A worker must reuse an existing branch, PR, and marker rather than create duplicates after a retry.

All runtime helpers, discovery scripts, locks, mirrors, worktrees, and temporary outputs must live under `/opt/data/agent-office-worker`; workers must never create runtime files in this repository root.

## Planner

1. Atomically claim a queued issue with `agent-office:planning`.
2. Revalidate owner, author, repository marker, repository existence, and default branch.
3. Inspect the repository read-only.
4. Post a bounded plan with acceptance criteria, expected files, tests/build commands, and risks using `<!-- agent-office:planner:v1 -->`.
5. Move to `agent-office:building`, or `blocked` with a public reason.

Planner never modifies source, pushes, merges, deploys, or reads secrets.

## Builder

1. Claim one `agent-office:building` issue with an atomic filesystem lock and revalidate all GitHub identity fields.
2. Use a unique worktree rooted under `/opt/data/agent-office-worker/runs/<repo>-issue-<number>`.
3. Fetch the current default branch and create/reuse `agent-office/issue-<number>`.
4. Modify only the claimed repository, using the smallest patch satisfying the issue and Planner criteria.
5. Run the repository's configured tests, typecheck/lint, and build where available.
6. Scan the diff for credentials and reject generated/runtime artifacts.
7. Commit and push only the issue branch; create/reuse one PR.
8. Comment with `<!-- agent-office:builder:v1 -->`, changed files, real commands/results, commit SHA and PR URL.
9. Move to `agent-office:qa`, or `blocked` with reproducible evidence.

Builder never writes the default branch directly, force-pushes, merges, deploys, changes provider settings, or accesses `password.md`/credential stores.

## QA

1. Claim one `agent-office:qa` issue and locate the canonical PR for its deterministic branch.
2. Verify head/base repository identity and reject forks or unexpected branches.
3. Check out the exact PR head in a clean worktree.
4. Re-run affected and full available quality gates.
5. Review authorization, traversal, project isolation, secret leakage, destructive behavior, and issue acceptance criteria.
6. Post `<!-- agent-office:qa:v1 -->` with exact SHA and evidence.
7. Move to `done` only with zero security concerns and zero logic errors; otherwise move to `blocked` or back to `building` with a deterministic counterexample.

QA never merges, deploys, edits source, or approves its own stale tree.

## Authentication and secret handling

- Git remotes must stay credential-free HTTPS URLs.
- Tokens are loaded in process memory from the protected runtime helper and never printed, written to issue comments, stored in repository files, or placed in remote URLs.
- Canonical NAS `password.md` is never read, deleted, replaced, or treated as a temporary credential file.
- Temporary worktrees contain no copied credentials and are removed only after branch/PR evidence is durable.

## User approval boundary

Creating the GitHub issue is the user approval to plan, edit the issue repository, push a non-default branch, and open a PR. Merge, deployment, secrets, external messages, destructive operations, billing, and provider configuration always require a separate explicit approval.
