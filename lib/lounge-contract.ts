import type { RoleId } from './status-contract';
import type { TaskProgress } from './progress-contract';
export type ActivityProof={id:string;taskId:string;runId:string;attemptId:string;planVersion:number;provider:'codex'|'claude';source:'codex-native'|'claude-supervisor';state:'running'|'reviewing'|'stopped'|'unknown';confirmedAt:string;leaseExpiresAt:string};
export type LoungeMode='idle'|'waiting'|'working'|'reviewing'|'blocked'|'failed'|'canceled'|'completed'|'unknown'|'stale';
export type LoungeRoleView={role:RoleId;mode:LoungeMode;task:TaskProgress|null;attemptId:string|null;verifiedPct:number|null;candidateTaskIds:string[];statusLabel:string;completionKey:string|null};
export type LoungeFilter={project:{kind:'all'}|{kind:'private';id:string}|{kind:'public';id:string};provider:'codex'|'claude'|null};
