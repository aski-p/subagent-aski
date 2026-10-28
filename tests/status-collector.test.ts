import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createServer} from "../scripts/agent-status/adapter.mjs";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixture} from "./fixtures/status/snapshot";
test("collector projects only structural metadata and registry summaries",()=>{
 const p=spawnSync("python3",["scripts/agent-status/collector_test.py"],{encoding:"utf8"});assert.equal(p.status,0,p.stderr+p.stdout);
});
test("adapter accepts exact authenticated GET only; malformed spool keeps last good",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"office-test-"));writeFileSync(join(dir,"windows-codex.json"),JSON.stringify({...fixture(),observedAt:new Date().toISOString(),coverage:[{...fixture().coverage[0],collectedAt:new Date().toISOString()}]}));
 const server=createServer({spoolDir:dir,token:"dedicated-read-token"});await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const a=server.address();assert.ok(a&&typeof a!=="string");const url=`http://127.0.0.1:${a.port}/agent-office-status`;
 try{assert.equal((await fetch(url)).status,401);const opts={headers:{authorization:"Bearer dedicated-read-token"}};
 assert.equal((await fetch(url,{...opts,method:"POST"})).status,405);assert.equal((await fetch(url+"/other",opts)).status,404);
 const good=await fetch(url,opts);assert.equal(good.status,200);assert.match(good.headers.get("cache-control")!,/no-store/);
 writeFileSync(join(dir,"windows-codex.json"),'{"raw":"SECRET');const kept=await (await fetch(url,opts)).json();assert.ok(kept.coverage.some((x:{reasonCode:string})=>x.reasonCode==="invalid_spool"));assert.ok(!JSON.stringify(kept).includes("SECRET"));
 }finally{await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
