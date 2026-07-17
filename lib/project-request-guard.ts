export type ProjectRequestGuard = {
  version: number;
  repo: string;
};

export function beginProjectRequest(current: ProjectRequestGuard, repo: string): ProjectRequestGuard {
  return { version: current.version + 1, repo };
}

export function isCurrentProjectRequest(current: ProjectRequestGuard, candidate: ProjectRequestGuard): boolean {
  return current.version === candidate.version && current.repo === candidate.repo;
}
