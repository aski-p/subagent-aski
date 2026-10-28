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

test("nonASCII bearer rejects without killing an actual HTTP adapter process",()=>{
 const probe=spawnSync(process.execPath,["--input-type=module","-e",`
 import {createServer} from "./scripts/agent-status/adapter.mjs";
 import http from "node:http";
 const server=createServer({spoolDir:"/nonexistent-test-spool",token:"a".repeat(24)});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=server.address().port;
 const status=await new Promise((resolve,reject)=>{http.get({hostname:"127.0.0.1",port,path:"/agent-office-status",headers:{authorization:"Bearer "+"é".repeat(24)}},res=>{res.resume();res.on("end",()=>resolve(res.statusCode));}).on("error",reject);});
 if(status!==401)throw new Error("expected401");
 const next=await fetch("http://127.0.0.1:"+port+"/agent-office-status",{headers:{authorization:"Bearer "+"a".repeat(24)}});
 if(next.status!==200)throw new Error("server_died");
 await new Promise(resolve=>server.close(resolve));console.log("malformed401 subsequent200");
 `],{encoding:"utf8",timeout:10000});
 assert.equal(probe.status,0,probe.stderr+probe.stdout);assert.match(probe.stdout,/malformed401 subsequent200/);
});

test("board naive timestamps use only an explicit source timezone; malformed config is isolated",()=>{
 const result=spawnSync("python3",["-c",`
import contextlib,io,json,sys,tempfile
from pathlib import Path
sys.path.insert(0,'scripts/agent-status')
from collector import collect,run_once,stamp
with tempfile.TemporaryDirectory() as d:
 root=Path(d);board=root/'board.json';board.write_text(json.dumps({'status':{'codex':{'at':'2025-02-03 12:34'}}}))
 reg={'identitySalt':'s'*48,'sources':{'pgx-relay':{'boardFile':str(board)}},'boardAgents':{'codex':{}},'tasks':[]}
 assert collect('pgx-relay',reg,{})['coverage'][0]['lastActivityAt'] is None
 reg['sources']['pgx-relay']['naiveTimeZone']='Asia/Seoul'
 snap=collect('pgx-relay',reg,{})
 assert snap['coverage'][0]['lastActivityAt']=='2025-02-03T03:34:00Z'
 assert snap['agents'][0]['lastActivityAt']=='2025-02-03T03:34:00Z'
 assert stamp('2025-02-03 12:34') is None
 board.write_text(json.dumps({'status':{'codex':{'at':'malformed date SENTINEL_SECRET'}}}))
 assert collect('pgx-relay',reg,{})['coverage'][0]['lastActivityAt'] is None
 board.write_text(json.dumps({'status':{'codex':{'at':'2025-02-03T12:34:00+02:00'}}}))
 assert collect('pgx-relay',reg,{})['coverage'][0]['lastActivityAt']=='2025-02-03T10:34:00Z'
 spool=root/'spool';cache=root/'cache.json';registry=root/'registry.json'
 registry.write_text(json.dumps(reg));run_once(registry,spool,cache,('pgx-relay',));good=(spool/'pgx-relay.json').read_bytes()
 codex=root/'codex.jsonl';codex.write_text(json.dumps({'type':'session_meta','payload':{'id':'synthetic-codex'}})+chr(10))
 claude=root/'claude.jsonl';claude.write_text(json.dumps({'type':'assistant','sessionId':'synthetic-claude','message':{'model':'claude-test'}})+chr(10))
 reg['sources'].update({'pgx-codex':{'files':[str(codex)]},'pgx-claude':{'files':[str(claude)]}})
 for invalid in ['Invalid/Not_A_Zone',42,'/etc/passwd']:
  reg['sources']['pgx-relay']['naiveTimeZone']=invalid;registry.write_text(json.dumps(reg));out=io.StringIO()
  with contextlib.redirect_stdout(out):run_once(registry,spool,cache,('pgx-relay','pgx-codex','pgx-claude'))
  assert (spool/'pgx-relay.json').read_bytes()==good
  assert json.loads((spool/'pgx-codex.json').read_text())['agents']
  assert json.loads((spool/'pgx-claude.json').read_text())['agents']
  assert out.getvalue().strip()=='pgx-relay: source_unavailable'
 print('explicit KST UTC conversion; unconfigured/malformed null; invalid timezone isolated: pass')
 `],{encoding:"utf8"});
 assert.equal(result.status,0,result.stderr+result.stdout);
});
