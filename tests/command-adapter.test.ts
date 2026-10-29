import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import type {AddressInfo} from "node:net";
import {createServer} from "../scripts/agent-status/adapter.mjs";
const read="r".repeat(40),write="w".repeat(40),input={schemaVersion:1,clientRequestId:"12345678-1234-4234-8234-123456789012",projectId:null,text:"hello"};
const receipt={id:"12345678-1234-4234-8234-123456789012",projectId:null,summary:"Owner command",state:"accepted",processingStage:"not_received",lastHandledAt:null,createdAt:"2026-10-30T00:00:00Z",updatedAt:"2026-10-30T00:00:00Z",expiresAt:"2026-10-31T00:00:00Z",runId:null,replyKind:null,replySummary:null,replyToCommandId:null,replyUpdatedAt:null,safeErrorCode:null};
test("isolated adapter enforces token direction, fixed helper and safe output",async()=>{const dir=await mkdtemp(join(tmpdir(),"command-adapter-"));const helper=join(dir,"helper.py");await writeFile(helper,`import sys,json
v=json.load(sys.stdin)
if sys.argv[-1]=="command-list": print(json.dumps({"receipts":[],"nextCursor":None}))
elif v["input"]["text"]=="rate": print(json.dumps({"error":"rate_limited","status":429,"retryAfter":12})); sys.exit(1)
elif v["input"]["text"]=="leak": print(json.dumps({"receipt":{"raw":"secret"},"replayed":False}))
else: print(json.dumps({"receipt":${JSON.stringify(receipt).replace(/null/g,"None")},"replayed":v["input"]["text"]=="retry"}))
`);
 const server=createServer({spoolDir:dir,token:read,commandToken:write,commandsEnabled:true,commandDbPath:join(dir,"fixed.db"),commandCapabilityFile:join(dir,"fixed.cap"),commandHelperPath:helper});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+(server.address() as AddressInfo).port+"/agent-office-status";
 const call=(path:string,token:string,method="GET",body?:unknown)=>fetch(url+path,{method,headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
 try{
 assert.equal((await call("?view=commands",read,"POST",{actor:69686315,input})).status,403);
 for(const p of ["","?view=progress","?view=commands"])assert.equal((await call(p,write)).status,403);
 assert.equal((await call("?view=commands",read)).status,200);
 assert.equal((await call("?view=commands",write,"POST",{actor:69686315,input:{...input,text:"x".repeat(17000)}})).status,400);

 for(const p of ["?view=commands&x=1","?view=commands&view=commands","/other"])assert.equal((await call(p,write,"POST",{actor:69686315,input})).status,404);
 assert.equal((await call("?view=commands",write,"POST",{actor:69686316,input})).status,400);
 assert.equal((await call("?view=commands",write,"POST",{actor:69686315,input:{...input,boss:"x"}})).status,400);
 for(const [text,status] of [["hello",202],["retry",200],["rate",429],["leak",503]] as const){const r=await call("?view=commands",write,"POST",{actor:69686315,input:{...input,text}});assert.equal(r.status,status);if(status===429)assert.equal(r.headers.get("retry-after"),"12");assert(!(await r.text()).includes("secret"))}
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true})}});

test("adapter commits SQLite before 202 and retries list the same sanitized receipt",async()=>{const dir=await mkdtemp(join(tmpdir(),"command-durable-")),db=join(dir,"db"),cap=join(dir,"web"),purge=join(dir,"purge");
 const setup=`import sys
sys.path.insert(0,"scripts/agent-office")
from ledger import Ledger
from commands import CommandStore
b=Ledger.bootstrap(sys.argv[1],sys.argv[2],"synthetic-boss")
b.issue_command_capability(sys.argv[3],"web-intake",owner_id="69686315",binding_id="fixed",project_ids=[])
b.issue_command_capability(sys.argv[4],"boss-dispatch",owner_id="69686315",binding_id="fixed",project_ids=[])
CommandStore(sys.argv[1])
`;
 execFileSync("/usr/bin/python3",["-c",setup,db,join(dir,"boss"),cap,purge]);
 const server=createServer({spoolDir:dir,token:read,commandToken:write,commandsEnabled:true,commandDbPath:db,commandCapabilityFile:cap,commandHelperPath:resolve("scripts/agent-office/office_cli.py"),commandMaintenanceCapabilityFile:purge});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address() as AddressInfo,url="http://127.0.0.1:"+address.port+"/agent-office-status?view=commands";
 try{let first;for(const status of [202,200]){const r=await fetch(url,{method:"POST",headers:{authorization:"Bearer "+write,"content-type":"application/json"},body:JSON.stringify({actor:69686315,input})});assert.equal(r.status,status);const body=await r.json();first??=body.receipt;assert.deepEqual(body.receipt,first);assert.equal(body.replayed,status===200);
 const check=execFileSync("/usr/bin/python3",["-c","import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select count(*) from commands').fetchone()[0])",db],{encoding:"utf8"});assert.equal(check.trim(),"1");}
 const equivalent=await fetch(url,{method:"POST",headers:{authorization:"Bearer "+write,"content-type":"application/json"},body:JSON.stringify({actor:69686315,input:{...input,clientRequestId:"22345678-1234-4234-8234-123456789012"}})});
 assert.equal(equivalent.status,409);assert.deepEqual(await equivalent.json(),{error:"equivalent_pending",existingReceiptId:first.id});
 const check=execFileSync("/usr/bin/python3",["-c","import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select count(*) from commands').fetchone()[0])",db],{encoding:"utf8"});assert.equal(check.trim(),"1");
 const r=await fetch(url,{headers:{authorization:"Bearer "+read}}),body=await r.json();assert.equal(body.receipts.length,1);assert(!JSON.stringify(body).includes("hello"));assert(!JSON.stringify(body).includes("synthetic-boss"));
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true})}});
test("helper timeout and oversized/invalid stdout remain safe unknown outcomes",async()=>{const dir=await mkdtemp(join(tmpdir(),"command-bounds-")),helper=join(dir,"helper.py");
 await writeFile(helper,'import sys,json,time\nv=json.load(sys.stdin)\nif v["input"]["text"]=="hang": time.sleep(2)\nelse: print("secret"*200000)\n');
 const server=createServer({spoolDir:dir,token:read,commandToken:write,commandsEnabled:true,commandDbPath:join(dir,"db"),commandCapabilityFile:join(dir,"cap"),commandHelperPath:helper,commandTimeoutMs:100});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+(server.address() as AddressInfo).port+"/agent-office-status?view=commands";
 try{for(const text of ["hang","large"]){const r=await fetch(url,{method:"POST",headers:{authorization:"Bearer "+write,"content-type":"application/json"},body:JSON.stringify({actor:69686315,input:{...input,text}})});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"source_unavailable",outcomeUnknown:true})}}
 finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true})}});

test("default closed intake and private startup maintenance run independently of public reads",async()=>{const dir=await mkdtemp(join(tmpdir(),"command-maintenance-")),helper=join(dir,"helper.py"),marker=join(dir,"marker");
 await writeFile(helper,`import sys,json,pathlib
v=json.load(sys.stdin)
assert sys.argv[-1]=="command-purge" and v=={}
pathlib.Path(${JSON.stringify(marker)}).write_text("purged")
print('{"purgedPayloads":0,"purgedReceipts":0}')
`);
 const server=createServer({spoolDir:dir,token:read,commandToken:write,commandDbPath:join(dir,"db"),commandCapabilityFile:join(dir,"web"),commandHelperPath:helper,commandMaintenanceCapabilityFile:join(dir,"purge")});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const url="http://127.0.0.1:"+(server.address() as AddressInfo).port+"/agent-office-status?view=commands";
 try{for(const method of ["GET","POST"]){const r=await fetch(url,{method,headers:{authorization:"Bearer "+(method==="GET"?read:write)}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"commands_disabled"})}
 for(let i=0;i<20;i++){try{assert.equal(await readFile(marker,"utf8"),"purged");break}catch{if(i===19)throw Error("private maintenance did not tick");await new Promise(r=>setTimeout(r,10))}}
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true})}});


test("equivalent helper errors require exactly one valid original opaque receipt UUID",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"command-equivalent-")),helper=join(dir,"helper.py");
 await writeFile(helper,'import sys,json\nv=json.load(sys.stdin)\nd={"error":"equivalent_pending","status":409}\nif v["input"]["text"]!="missing":d["existingReceiptId"]=v["input"]["text"]\nif v["input"]["text"]=="extra":d.update(existingReceiptId="12345678-1234-4234-8234-123456789012",raw="private")\nprint(json.dumps(d));sys.exit(1)\n');
 const server=createServer({spoolDir:dir,token:read,commandToken:write,commandsEnabled:true,commandDbPath:join(dir,"db"),commandCapabilityFile:join(dir,"cap"),commandHelperPath:helper});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 const url="http://127.0.0.1:"+(server.address() as AddressInfo).port+"/agent-office-status?view=commands";
 try{for(const text of ["missing","native-private","/private/path","extra","12345678-1234-4234-8234-123456789012"]){
  const response=await fetch(url,{method:"POST",headers:{authorization:"Bearer "+write,"content-type":"application/json"},body:JSON.stringify({actor:69686315,input:{...input,text}})});
  if(text===receipt.id){assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:"equivalent_pending",existingReceiptId:text})}
  else {assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"source_unavailable",outcomeUnknown:true})}
 }}finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true})}
});
