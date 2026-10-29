export type WorkState="queued"|"working"|"qa"|"done"|"blocked"|"failed"|"canceled";
export type PrivateProject={id:string;label:string;repositoryUrl:string|null;visibility:"private"};
export type EvidenceView={id:string;kind:"commit"|"verification"|"link";label:string;safeUrl:string|null;verifiedAt:string|null};
export type CheckpointView={id:string;label:string;weight:number;bossOnly:boolean;state:"pending"|"reported"|"accepted"|"revoked";evidence:EvidenceView[]};
export type AttemptView={id:string;state:WorkState;observedModel:string|null;startedAt:string;endedAt:string|null};
export type RunProgress={id:string;bossId:string;bossLabel:string|null;projectId:string;objectiveSummary:string;planVersion:number;state:WorkState;verifiedPct:number;workerPct:number;updatedAt:string};
export type TaskProgress={id:string;runId:string;parentTaskId:string|null;role:string;provider:"codex"|"claude";requestedModel:string|null;observedModel:string|null;state:WorkState;planVersion:number;verifiedPct:number;workerPct:number;blockerSummary:string|null;updatedAt:string;checkpoints:CheckpointView[];attempts:AttemptView[]};
export type ReportView={id:string;runId:string;revision:number;status:"pending"|"sending"|"queued"|"acknowledged"|"retry_wait"|"failed"|"uncertain";updatedAt:string};
export type ProgressV1={schemaVersion:1;observedAt:string;catalogState:"available"|"unavailable"|"stale";projects:PrivateProject[];runs:RunProgress[];tasks:TaskProgress[];reports:ReportView[]};
const fail=():never=>{throw Error("invalid_progress")};
const obj=(v:unknown,keys:string[])=>{if(!v||typeof v!=="object"||Array.isArray(v))return fail();const o=v as Record<string,unknown>;if(Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k)))return fail();return o};
const text=(v:unknown):string=>typeof v==="string"&&v.length>0&&v.length<=300&&!/[\x00-\x1f\x7f]/.test(v)?v:fail();
const id=(v:unknown):string=>{const s=text(v);return /^[A-Za-z0-9_.:-]{1,128}$/.test(s)?s:fail()};
const nullable=<T>(v:unknown,parse:(x:unknown)=>T):T|null=>v===null?null:parse(v);
const en=<T extends string>(v:unknown,values:readonly T[]):T=>typeof v==="string"&&values.includes(v as T)?v as T:fail();
const num=(v:unknown,max:number,min=0):number=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:fail();
const integer=(v:unknown):number=>{const n=num(v,1000000,1);return Number.isInteger(n)?n:fail()};
const list=<T extends {id:string}>(v:unknown,max:number,parse:(x:unknown)=>T):T[]=>{if(!Array.isArray(v)||v.length>max)return fail();const xs=v.map(parse);if(new Set(xs.map(x=>x.id)).size!==xs.length)return fail();return xs};
const bounded=(v:unknown)=>{try{if(new TextEncoder().encode(JSON.stringify(v)).length>1048576)fail()}catch{return fail()}};
const work=(v:unknown):WorkState=>en(v,["queued","working","qa","done","blocked","failed","canceled"]);
const safeUrl=(v:unknown,repository=false):string|null=>{if(v===null)return null;const s=text(v);let u:URL;try{u=new URL(s)}catch{return fail()}
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||u.href!==s)return fail();
 if(repository){if(u.hostname!=="github.com"||!/^\/[A-Za-z0-9_-][A-Za-z0-9_-]*\/[A-Za-z0-9_.-]+$/.test(u.pathname)||u.pathname.endsWith("/.")||u.pathname.endsWith("/.."))return fail()}
 else if(u.hostname!=="github.com"&&!u.hostname.endsWith(".vercel.app"))return fail();
 return s};
const parseProject=(v:unknown):PrivateProject=>{const x=obj(v,["id","label","repositoryUrl","visibility"]);return {id:id(x.id),label:text(x.label),repositoryUrl:safeUrl(x.repositoryUrl,true),visibility:en(x.visibility,["private"])}};
export function parseProjectCatalog(value:unknown):{schemaVersion:1;projects:PrivateProject[]}{bounded(value);const o=obj(value,["schemaVersion","projects"]);if(o.schemaVersion!==1)return fail();return {schemaVersion:1,projects:list(o.projects,500,parseProject)}}
export function parseProgress(value:unknown,nowMs=Date.now()):ProgressV1{
 bounded(value);const o=obj(value,["schemaVersion","observedAt","catalogState","projects","runs","tasks","reports"]);if(o.schemaVersion!==1)return fail();
 const date=(v:unknown):string=>{const s=text(v);const ms=Date.parse(s);return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(ms)&&new Date(ms).toISOString()===s.replace(/Z$/,s.includes(".")?"Z":".000Z")&&ms<=nowMs+60000?s:fail()};
 const evidence=(v:unknown):EvidenceView=>{const x=obj(v,["id","kind","label","safeUrl","verifiedAt"]);return {id:id(x.id),kind:en(x.kind,["commit","verification","link"]),label:text(x.label),safeUrl:safeUrl(x.safeUrl),verifiedAt:nullable(x.verifiedAt,date)}};
 const checkpoint=(v:unknown):CheckpointView=>{const x=obj(v,["id","label","weight","bossOnly","state","evidence"]);if(typeof x.bossOnly!=="boolean")return fail();return {id:id(x.id),label:text(x.label),weight:num(x.weight,1000000),bossOnly:x.bossOnly,state:en(x.state,["pending","reported","accepted","revoked"]),evidence:list(x.evidence,100,evidence)}};
 const attempt=(v:unknown):AttemptView=>{const x=obj(v,["id","state","observedModel","startedAt","endedAt"]);const startedAt=date(x.startedAt),endedAt=nullable(x.endedAt,date);if(endedAt&&Date.parse(endedAt)<Date.parse(startedAt))return fail();return {id:id(x.id),state:work(x.state),observedModel:nullable(x.observedModel,text),startedAt,endedAt}};
 const runs=list(o.runs,500,(v):RunProgress=>{const x=obj(v,["id","bossId","bossLabel","projectId","objectiveSummary","planVersion","state","verifiedPct","workerPct","updatedAt"]);return {id:id(x.id),bossId:id(x.bossId),bossLabel:nullable(x.bossLabel,text),projectId:id(x.projectId),objectiveSummary:text(x.objectiveSummary),planVersion:integer(x.planVersion),state:work(x.state),verifiedPct:num(x.verifiedPct,100),workerPct:num(x.workerPct,100),updatedAt:date(x.updatedAt)}});
 const tasks=list(o.tasks,2000,(v):TaskProgress=>{const x=obj(v,["id","runId","parentTaskId","role","provider","requestedModel","observedModel","state","planVersion","verifiedPct","workerPct","blockerSummary","updatedAt","checkpoints","attempts"]);return {id:id(x.id),runId:id(x.runId),parentTaskId:nullable(x.parentTaskId,id),role:text(x.role),provider:en(x.provider,["codex","claude"]),requestedModel:nullable(x.requestedModel,text),observedModel:nullable(x.observedModel,text),state:work(x.state),planVersion:integer(x.planVersion),verifiedPct:num(x.verifiedPct,100),workerPct:num(x.workerPct,100),blockerSummary:nullable(x.blockerSummary,text),updatedAt:date(x.updatedAt),checkpoints:list(x.checkpoints,100,checkpoint),attempts:list(x.attempts,100,attempt)}});
 const reports=list(o.reports,2000,(v):ReportView=>{const x=obj(v,["id","runId","revision","status","updatedAt"]);return {id:id(x.id),runId:id(x.runId),revision:integer(x.revision),status:en(x.status,["pending","sending","queued","acknowledged","retry_wait","failed","uncertain"]),updatedAt:date(x.updatedAt)}});
 return {schemaVersion:1,observedAt:date(o.observedAt),catalogState:en(o.catalogState,["available","unavailable","stale"]),projects:list(o.projects,500,parseProject),runs,tasks,reports};
}
