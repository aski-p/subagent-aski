import type { AgentView } from "./status-contract";

export function partitionRoster(agents: AgentView[]): { assigned: AgentView[]; unassigned: AgentView[] } {
  const result: { assigned: AgentView[]; unassigned: AgentView[] } = { assigned: [], unassigned: [] };
  for (const agent of agents) {
    (agent.roleId || agent.projectId || agent.currentTaskId ? result.assigned : result.unassigned).push(agent);
  }
  return result;
}

export function rosterProviderLabel(provider: string | null): string {
  if (provider === null) return "제공자 미수집";
  switch (provider) {
    case "openai": return "Codex";
    case "anthropic": return "Claude";
    case "qwen": return "Qwen";
    default: return provider;
  }
}
