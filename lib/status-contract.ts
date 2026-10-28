export const SOURCES = ["pgx-relay", "pgx-codex", "pgx-claude", "windows-codex"] as const;
export type Source = typeof SOURCES[number];
export const ROLES = ["atlas", "forge", "frame", "palette", "scout", "sentinel"] as const;
export type RoleId = typeof ROLES[number];
export type SourceCoverage = {source:Source;connection:"connected"|"stale"|"unknown"|"offline";coverage:"registered"|"metadata-only"|"unsupported";collectedAt:string|null;lastActivityAt:string|null;reasonCode:string|null};
export type AgentView={id:string;name:string|null;roleId:RoleId|null;parentId:string|null;provider:string|null;model:string|null;projectId:string|null;currentTaskId:string|null;status:"working"|"completed"|"blocked"|"idle"|"unknown";lastActivityAt:string|null;lastSeenAt:string|null;source:Source};
export type TaskView={id:string;projectId:string|null;title:string|null;status:"queued"|"working"|"qa"|"done"|"blocked"|"unknown";assigneeIds:string[];source:string;sourceUrl:string|null;updatedAt:string|null};
export type EventView={id:string;agentId:string|null;taskId:string|null;type:"task_started"|"task_complete"|"thread_settings_applied"|"item_completed";publicSummary:string|null;occurredAt:string};
export type ArtifactView={id:string;taskId:string|null;kind:"link"|"commit"|"pull_request"|"verification";label:string|null;safeUrl:string|null;verifiedAt:string|null};
export type SnapshotV1={schemaVersion:1;snapshotId:string;observedAt:string;coverage:SourceCoverage[];agents:AgentView[];tasks:TaskView[];events:EventView[];artifacts:ArtifactView[]};
const fail=():never=>{throw new Error("invalid_snapshot");};
const object=(v:unknown,keys:string[]):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))return fail();const o=v as Record<string,unknown>;if(Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))return fail();return o;};
const str=(v:unknown):string=>typeof v==="string"&&v.length>0&&v.length<=300&&!/[\x00-\x1f]/.test(v)?v:fail();
const nullable=(v:unknown):string|null=>v===null?null:str(v);
const date=(v:unknown):string=>{const s=str(v);return /^\d{4}-\d\d-\d\dT/.test(s)&&Number.isFinite(Date.parse(s))?s:fail();};
const nd=(v:unknown):string|null=>v===null?null:date(v);
const en=<T extends string>(v:unknown,values:readonly T[]):T=>typeof v==="string"&&values.includes(v as T)?v as T:fail();
const arr=<T>(v:unknown,max:number,parse:(x:unknown)=>T):T[]=>Array.isArray(v)&&v.length<=max?v.map(parse):fail();
const url=(v:unknown):string|null=>{if(v===null)return null;const s=str(v);let u;try{u=new URL(s);}catch{return fail();}if(u.protocol!=="https:"||u.username||u.password||u.port||!(u.hostname==="github.com"||u.hostname.endsWith(".vercel.app")))return fail();return s;};
export function parseSnapshot(value:unknown,nowMs=Date.now()):SnapshotV1{
 const o=object(value,["schemaVersion","snapshotId","observedAt","coverage","agents","tasks","events","artifacts"]);if(o.schemaVersion!==1)return fail();
 const coverage=arr(o.coverage,4,v=>{const x=object(v,["source","connection","coverage","collectedAt","lastActivityAt","reasonCode"]);const at=nd(x.collectedAt);let connection=en(x.connection,["connected","stale","unknown","offline"]);if(at&&Date.parse(at)>nowMs+60000)return fail();if(connection==="connected"&&(!at||nowMs-Date.parse(at)>90000))connection="stale";const reason=nullable(x.reasonCode);if(reason&&!/^[a-z_]{1,60}$/.test(reason))return fail();return {source:en(x.source,SOURCES),connection,coverage:en(x.coverage,["registered","metadata-only","unsupported"]),collectedAt:at,lastActivityAt:nd(x.lastActivityAt),reasonCode:reason};});
 if(new Set(coverage.map(x=>x.source)).size!==coverage.length)return fail();
 const agents=arr(o.agents,500,v=>{const x=object(v,["id","name","roleId","parentId","provider","model","projectId","currentTaskId","status","lastActivityAt","lastSeenAt","source"]);return {id:str(x.id),name:nullable(x.name),roleId:x.roleId===null?null:en(x.roleId,ROLES),parentId:nullable(x.parentId),provider:nullable(x.provider),model:nullable(x.model),projectId:nullable(x.projectId),currentTaskId:nullable(x.currentTaskId),status:en(x.status,["working","completed","blocked","idle","unknown"]),lastActivityAt:nd(x.lastActivityAt),lastSeenAt:nd(x.lastSeenAt),source:en(x.source,SOURCES)};});
 const tasks=arr(o.tasks,500,v=>{const x=object(v,["id","projectId","title","status","assigneeIds","source","sourceUrl","updatedAt"]);return {id:str(x.id),projectId:nullable(x.projectId),title:nullable(x.title),status:en(x.status,["queued","working","qa","done","blocked","unknown"]),assigneeIds:arr(x.assigneeIds,100,str),source:str(x.source),sourceUrl:url(x.sourceUrl),updatedAt:nd(x.updatedAt)};});
 const events=arr(o.events,2000,v=>{const x=object(v,["id","agentId","taskId","type","publicSummary","occurredAt"]);return {id:str(x.id),agentId:nullable(x.agentId),taskId:nullable(x.taskId),type:en(x.type,["task_started","task_complete","thread_settings_applied","item_completed"]),publicSummary:nullable(x.publicSummary),occurredAt:date(x.occurredAt)};}).filter(x=>Date.parse(x.occurredAt)>=nowMs-86400000&&Date.parse(x.occurredAt)<=nowMs+60000).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)).slice(0,200);
 const artifacts=arr(o.artifacts,500,v=>{const x=object(v,["id","taskId","kind","label","safeUrl","verifiedAt"]);return {id:str(x.id),taskId:nullable(x.taskId),kind:en(x.kind,["link","commit","pull_request","verification"]),label:nullable(x.label),safeUrl:url(x.safeUrl),verifiedAt:nd(x.verifiedAt)};});
 return {schemaVersion:1,snapshotId:str(o.snapshotId),observedAt:date(o.observedAt),coverage,agents,tasks,events,artifacts};
}
