/** Public command contract. Runtime authority never comes from this payload. */
export type CommandInput={schemaVersion:1;clientRequestId:string;projectId:string|null;text:string;replyToCommandId?:string};
export type CommandState="accepted"|"claimed"|"queued"|"received"|"started"|"retry_wait"|"failed"|"uncertain"|"expired"|"handled"|"awaiting_input"|"closed";
export type ProcessingStage="not_received"|"received"|"classified"|"dispatch_intent"|"dispatched"|"handled";
export type CommandReceipt={id:string;projectId:string|null;summary:string;state:CommandState;processingStage:ProcessingStage;lastHandledAt:string|null;createdAt:string;updatedAt:string;expiresAt:string;runId:string|null;replyKind:"query_answer"|"clarification"|"ack"|null;replySummary:string|null;replyToCommandId:string|null;replyUpdatedAt:string|null;safeErrorCode:string|null};
export type CommandContext={schemaVersion:1;csrfToken:string;csrfExpiresAt:string;receipts:CommandReceipt[];nextCursor:string|null};
const fail=():never=>{throw Error("invalid_command")};
const object=(v:unknown,required:string[],optional:string[]=[])=>{
 if(!v||typeof v!=="object"||Array.isArray(v))return fail();
 const o=v as Record<string,unknown>;
 if(required.some(k=>!Object.hasOwn(o,k))||Object.keys(o).some(k=>![...required,...optional].includes(k)))return fail();
 return o;
};
const bounded=(v:unknown,max=1048576)=>{try{if(new TextEncoder().encode(JSON.stringify(v)).length>max)fail()}catch{return fail()}};
const text=(v:unknown,max:number,multiline=false):string=>typeof v==="string"&&[...v].length>0&&[...v].length<=max&&!(multiline?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)?v:fail();
const id=(v:unknown):string=>{const s=text(v,128);return /^[A-Za-z0-9_.:-]{1,128}$/.test(s)?s:fail()};
const uuid=(v:unknown):string=>{const s=text(v,36);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s)?s:fail()};
const nullable=<T>(v:unknown,p:(v:unknown)=>T):T|null=>v===null?null:p(v);
const en=<T extends string>(v:unknown,values:readonly T[]):T=>typeof v==="string"&&values.includes(v as T)?v as T:fail();
const date=(v:unknown):string=>{const s=text(v,30);const ms=Date.parse(s);return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(ms)&&new Date(ms).toISOString()===s.replace(/Z$/,s.includes(".")?"Z":".000Z")?s:fail()};
const cursor=(v:unknown):string=>{const s=text(v,200);return /^[A-Za-z0-9_-]+$/.test(s)?s:fail()};
export function parseCommandInput(value:unknown):CommandInput{
 bounded(value,16384);const o=object(value,["schemaVersion","clientRequestId","projectId","text"],["replyToCommandId"]);
 if(o.schemaVersion!==1||typeof o.text!=="string")return fail();
 const result:CommandInput={schemaVersion:1,clientRequestId:uuid(o.clientRequestId),projectId:nullable(o.projectId,id),text:text(o.text.trim(),4000,true)};
 if(Object.hasOwn(o,"replyToCommandId"))result.replyToCommandId=uuid(o.replyToCommandId);
 return result;
}
export function parseCommandReceipt(value:unknown):CommandReceipt{
 bounded(value);const o=object(value,["id","projectId","summary","state","processingStage","lastHandledAt","createdAt","updatedAt","expiresAt","runId","replyKind","replySummary","replyToCommandId","replyUpdatedAt","safeErrorCode"]);
 const createdAt=date(o.createdAt),updatedAt=date(o.updatedAt),expiresAt=date(o.expiresAt);
 if(Date.parse(updatedAt)<Date.parse(createdAt)||Date.parse(expiresAt)<Date.parse(createdAt))return fail();
 return {id:uuid(o.id),projectId:nullable(o.projectId,id),summary:text(o.summary,300),state:en(o.state,["accepted","claimed","queued","received","started","retry_wait","failed","uncertain","expired","handled","awaiting_input","closed"]),
 processingStage:en(o.processingStage,["not_received","received","classified","dispatch_intent","dispatched","handled"]),
 lastHandledAt:nullable(o.lastHandledAt,date),createdAt,updatedAt,expiresAt,
 runId:nullable(o.runId,v=>{const s=text(v,36);return /^run-[0-9a-f]{32}$/.test(s)?s:fail()}),
 replyKind:nullable(o.replyKind,v=>en(v,["query_answer","clarification","ack"])),
 replySummary:nullable(o.replySummary,v=>text(v,2000,true)),replyToCommandId:nullable(o.replyToCommandId,uuid),
 replyUpdatedAt:nullable(o.replyUpdatedAt,date),safeErrorCode:nullable(o.safeErrorCode,v=>en(v,["conflict","equivalent_pending","already_processed","rate_limited","boss_unavailable"]))};
}
export function parseCommandContext(value:unknown):CommandContext{
 bounded(value);const o=object(value,["schemaVersion","csrfToken","csrfExpiresAt","receipts","nextCursor"]);
 if(o.schemaVersion!==1||!Array.isArray(o.receipts)||o.receipts.length>50)return fail();
 const receipts=o.receipts.map(parseCommandReceipt);
 if(new Set(receipts.map(r=>r.id)).size!==receipts.length)return fail();
 return {schemaVersion:1,csrfToken:(()=>{const s=text(o.csrfToken,2048);return /^[A-Za-z0-9_.-]+$/.test(s)?s:fail()})(),csrfExpiresAt:date(o.csrfExpiresAt),receipts,nextCursor:nullable(o.nextCursor,cursor)};
}
