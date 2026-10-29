import type { RoleId } from './status-contract';
import type { TaskProgress } from './progress-contract';
export type ActivityProof={id:string;taskId:string;runId:string;attemptId:string;planVersion:number;provider:'codex'|'claude';source:'codex-native'|'claude-supervisor';state:'running'|'reviewing'|'stopped'|'unknown';confirmedAt:string;leaseExpiresAt:string};
export type LoungeMode='idle'|'waiting'|'working'|'reviewing'|'blocked'|'failed'|'canceled'|'completed'|'unknown'|'stale';
export type LoungeRoleView={role:RoleId;mode:LoungeMode;task:TaskProgress|null;attemptId:string|null;verifiedPct:number|null;candidateTaskIds:string[];statusLabel:string;completionKey:string|null};
export type LoungeFilter={project:{kind:'all'}|{kind:'private';id:string}|{kind:'public';id:string};provider:'codex'|'claude'|null};

export function parseActivityProofs(value:unknown):ActivityProof[] {
 const fail=():never=>{throw Error('invalid_progress')};
 if(!Array.isArray(value)||value.length>2000)return fail();
 const keys=['id','taskId','runId','attemptId','planVersion','provider','source','state','confirmedAt','leaseExpiresAt'];
 const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v);
 const date=(v:unknown):v is string=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v))return false;const n=Date.parse(v);return Number.isFinite(n)&&new Date(n).toISOString()===v.replace(/Z$/,v.includes('.')?'Z':'.000Z')};
 const result=value.map((v):ActivityProof=>{
  if(!v||typeof v!=='object'||Array.isArray(v))return fail();
  const o=v as Record<string,unknown>;
  if(Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))return fail();
  if(!identifier(o.id)||!identifier(o.taskId)||!identifier(o.runId)||!identifier(o.attemptId)||typeof o.planVersion!=='number'||!Number.isInteger(o.planVersion)||o.planVersion<1||o.planVersion>1000000)return fail();
  if(!((o.provider==='codex'&&o.source==='codex-native')||(o.provider==='claude'&&o.source==='claude-supervisor')))return fail();
  if(!['running','reviewing','stopped','unknown'].includes(o.state as string)||!date(o.confirmedAt)||!date(o.leaseExpiresAt))return fail();
  return o as ActivityProof;
 });
 if(new Set(result.map(p=>p.id)).size!==result.length)return fail();
 return result;
}
