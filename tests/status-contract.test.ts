import {test} from "node:test";
import assert from "node:assert/strict";
import {parseSnapshot} from "../lib/status-contract";
const now=Date.parse("2026-10-29T10:00:00Z");
const iso=(ms:number)=>new Date(ms).toISOString();
import {fixture} from "./fixtures/status/snapshot";
test("source heartbeat is distinct from task activity and transitions after90seconds",()=>{
 const f=fixture();assert.equal(parseSnapshot(f,now).coverage[0].connection,"connected");
 assert.equal(parseSnapshot(f,now+90001).coverage[0].connection,"stale");
 assert.equal(parseSnapshot(f,now).coverage[0].lastActivityAt,iso(now-3600000));
});
test("strict boundary rejects extra fields, unsafe URL and unknown model remains null",()=>{
 assert.throws(()=>parseSnapshot({...fixture(),transcript:"SECRET"},now));
 const f=fixture(); Object.assign(f,{agents:[{id:"hash",name:null,roleId:null,parentId:null,provider:null,model:null,projectId:null,currentTaskId:null,status:"unknown",lastActivityAt:null,lastSeenAt:iso(now),source:"windows-codex"}]});
 assert.equal(parseSnapshot(f,now).agents[0].model,null);
 Object.assign(f,{artifacts:[{id:"a",taskId:null,kind:"link",label:null,safeUrl:"javascript:alert(1)",verifiedAt:null}]});assert.throws(()=>parseSnapshot(f,now));
});
test("24hour/200event bounds remove oldest events",()=>{
 const f=fixture();Object.assign(f,{events:Array.from({length:205},(_,i)=>({id:String(i),agentId:null,taskId:null,type:"task_started",publicSummary:null,occurredAt:iso(now-i*1000)})).concat([{id:"old",agentId:null,taskId:null,type:"task_started",publicSummary:null,occurredAt:iso(now-86400001)}])});
 const s=parseSnapshot(f,now);assert.equal(s.events.length,200);assert.ok(!s.events.some(x=>x.id==="old"));
});
