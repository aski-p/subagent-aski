import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {once} from "node:events";
import {parseProgress,parseProjectCatalog} from "../lib/progress-contract";
import {createServer} from "../scripts/agent-status/adapter.mjs";
const project={id:"private-example",label:"Synthetic engine",repositoryUrl:"https://github.com/example/private-engine",visibility:"private"};
const view=()=>({schemaVersion:1,observedAt:new Date().toISOString(),catalogState:"available",projects:[project],runs:[],tasks:[],reports:[]});
test("strict private catalog includes projects with no work and rejects unsafe input",()=>{
 assert.equal(parseProgress(view()).projects.length,1);
 for(const bad of [{...view(),secret:"x"},{...view(),projects:[project,project]},{...view(),projects:[{...project,extra:1}]},...["https://github.com.evil.test/a/b","https://owner@github.com/a/b","javascript:alert(1)","https://github.com/a/b?token=x","https://github.com/a"].map(repositoryUrl=>({...view(),projects:[{...project,repositoryUrl}]}))])assert.throws(()=>parseProgress(bad));
 assert.throws(()=>parseProjectCatalog({schemaVersion:1,projects:[project],extra:1}));
 assert.throws(()=>parseProgress({...view(),observedAt:new Date(Date.now()+120000).toISOString()}));
 assert.throws(()=>parseProgress({...view(),projects:Array(501).fill(project)}));
});
test("adapter fixed private view handles absent, malformed and last-good catalog independently",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"progress-test-"));const catalogPath=join(dir,"projects.json");const progressPath=join(dir,"progress.json");
 const server=createServer({spoolDir:dir,token:"t".repeat(32),catalogPath,progressPath});server.listen(0,"127.0.0.1");await once(server,"listening");
 const address=server.address();assert.ok(address&&typeof address!=="string");const base="http://127.0.0.1:"+address.port+"/agent-office-status";
 const get=(suffix="?view=progress",token="t".repeat(32),method="GET")=>fetch(base+suffix,{method,headers:{Authorization:"Bearer "+token}});
 try{
  assert.equal((await get("","wrong")).status,401);assert.equal((await get("?view=progress","wrong")).status,401);
  for(const suffix of ["?view=other","?view=progress&view=progress","?view=progress&extra=1"])assert.equal((await get(suffix)).status,404);
  assert.equal((await get("?view=progress","t".repeat(32),"POST")).status,405);
  const absent=await (await get()).json();assert.deepEqual(absent.projects,[]);assert.equal(absent.catalogState,"unavailable");
  await writeFile(catalogPath,"broken");assert.equal((await (await get()).json()).catalogState,"unavailable");
  await writeFile(catalogPath,JSON.stringify({schemaVersion:1,projects:[project]}));
  const response=await get();assert.match(response.headers.get("cache-control")!,/private.*no-store/);
  const valid=await response.json();assert.deepEqual(valid.projects,[project]);assert.deepEqual(valid.tasks,[]);assert.equal(valid.catalogState,"available");
  await writeFile(catalogPath,JSON.stringify({schemaVersion:1,projects:[project,project]}));const stale=await (await get()).json();assert.equal(stale.catalogState,"stale");assert.deepEqual(stale.projects,[project]);
  await rm(catalogPath);assert.equal((await (await get()).json()).catalogState,"stale");
  const bare=await (await get("")).json();assert.ok("coverage" in bare);assert.equal("projects" in bare,false);
  await writeFile(progressPath,JSON.stringify({...view(),projects:[],runs:[],tasks:[],reports:[],extra:"secret"}));assert.equal((await get()).status,503);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});

test("progress validates every nested projection without inventing model or work",()=>{
 const at=new Date().toISOString();
 const run={id:"run-1",bossId:"boss-1",bossLabel:null,projectId:"private-example",objectiveSummary:"Synthetic objective",planVersion:1,state:"queued",verifiedPct:0,workerPct:20,updatedAt:at};
 const evidence={id:"evidence-1",kind:"verification",label:"Synthetic check",safeUrl:null,verifiedAt:null};
 const checkpoint={id:"checkpoint-1",label:"Boss approval",weight:1,bossOnly:true,state:"pending",evidence:[evidence]};
 const attempt={id:"attempt-1",state:"queued",observedModel:null,startedAt:at,endedAt:null};
 const task={id:"task-1",runId:"run-1",parentTaskId:null,role:"frame",provider:"codex",requestedModel:null,observedModel:null,state:"queued",planVersion:1,verifiedPct:0,workerPct:20,blockerSummary:null,updatedAt:at,checkpoints:[checkpoint],attempts:[attempt]};
 const report={id:"report-1",runId:"run-1",revision:1,status:"queued",updatedAt:at};
 const full={...view(),runs:[run],tasks:[task],reports:[report]};
 assert.equal(parseProgress(full).tasks[0].observedModel,null);
 for(const bad of [
  {...full,runs:[run,run]},
  {...full,runs:[{...run,workerPct:101}]},
  {...full,tasks:[{...task,requestedModel:"x".repeat(301)}]},
  {...full,tasks:[{...task,provider:"other"}]},
  {...full,tasks:[{...task,planVersion:1.5}]},
  {...full,tasks:[{...task,checkpoints:[{...checkpoint,weight:-1}]}]},
  {...full,tasks:[{...task,checkpoints:[{...checkpoint,bossOnly:"yes"}]}]},
  {...full,tasks:[{...task,checkpoints:[{...checkpoint,evidence:[{...evidence,raw:"secret"}]}]}]},
  {...full,tasks:[{...task,attempts:[{...attempt,state:"invented"}]}]},
  {...full,reports:[{...report,status:"delivered"}]},
  {...full,observedAt:"2026-02-31T10:00:00Z"}
 ])assert.throws(()=>parseProgress(bad));
 assert.throws(()=>parseProgress({...full,unknown:"x".repeat(1048576)}));
});
