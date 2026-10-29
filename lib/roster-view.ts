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
  return ({ openai: "Codex", anthropic: "Claude", qwen: "Qwen" } as Record<string, string>)[provider] ?? provider;
}
