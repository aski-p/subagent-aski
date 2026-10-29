import test from "node:test";
import assert from "node:assert/strict";
import {signSession} from "../lib/owner-auth";
import {readAdapterProgress} from "../lib/progress-client";
test("progress owner boundary denies before upstream and client uses only the fixed query",async()=>{
 process.env.JWT_SECRET="s".repeat(48);process.env.STATUS_ADAPTER_READ_TOKEN="t".repeat(32);process.env.STATUS_ADAPTER_URL="http://127.0.0.1:8460/agent-office-status";
 const {GET}=await import("../app/api/office/progress/route");
 const old=globalThis.fetch;let calls=0;let target="";
 const body={schemaVersion:1,observedAt:new Date().toISOString(),catalogState:"unavailable",projects:[],runs:[],tasks:[],reports:[]};
 globalThis.fetch=async(input)=>{calls++;target=String(input);return Response.json(body)};
 try{
  for(const [cookie,status] of [["",401],["__Host-office_session="+signSession(69686316,process.env.JWT_SECRET),403]] as const){const r=await GET(new Request("https://office.example/api/office/progress",{headers:{cookie}}));assert.equal(r.status,status);assert.match(r.headers.get("cache-control")!,/private.*no-store/);}
  assert.equal(calls,0);
  await readAdapterProgress();assert.equal(target,"http://127.0.0.1:8460/agent-office-status?view=progress");
  for(const suffix of ["?view=progress","?other=1","#fragment","?","#"]){process.env.STATUS_ADAPTER_URL="http://127.0.0.1:8460/agent-office-status"+suffix;await assert.rejects(readAdapterProgress());}assert.equal(calls,1);
  process.env.STATUS_ADAPTER_URL="http://127.0.0.1:8460/agent-office-status";
  globalThis.fetch=async()=>new Response("x".repeat(1048577));await assert.rejects(readAdapterProgress());
  const r=await GET(new Request("https://office.example/api/office/progress",{headers:{cookie:"__Host-office_session="+signSession(69686315,process.env.JWT_SECRET)}}));assert.equal(r.status,503);assert.deepEqual(Object.keys(await r.json()).sort(),["checkedAt","error"]);
 }finally{globalThis.fetch=old}
});
