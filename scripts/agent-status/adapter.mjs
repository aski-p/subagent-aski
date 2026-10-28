import http from "node:http";
import {readFile,stat,writeFile,rename,mkdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {timingSafeEqual,randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {parseSnapshot,SOURCES} from "../../lib/status-contract.ts";
export function createServer({spoolDir,token,snapshotPath=undefined}) {
 if(!token||token.length<16)throw new Error("read_token_required");
 const lastGood=new Map();
 const restored=(async()=>{if(!snapshotPath)return;try{if((await stat(snapshotPath)).size>1048576)return;const s=parseSnapshot(JSON.parse(await readFile(snapshotPath,"utf8")));for(const c of s.coverage){lastGood.set(c.source,{...s,coverage:[c],agents:s.agents.filter(a=>a.source===c.source),tasks:s.tasks.filter(t=>t.source===c.source),events:s.events.filter(e=>s.agents.some(a=>a.id===e.agentId&&a.source===c.source)),artifacts:[]});}}catch{}})();
 async function snapshot(){await restored;const now=Date.now(),coverage=[],agents=[],tasks=[],events=[],artifacts=[];
  for(const source of SOURCES){let invalid=false;try{const file=join(spoolDir,source+".json");if((await stat(file)).size>1048576)throw new Error();const s=parseSnapshot(JSON.parse(await readFile(file,"utf8")),now);if(s.coverage.length!==1||s.coverage[0].source!==source||s.agents.some(a=>a.source!==source))throw new Error();lastGood.set(source,s);}catch{invalid=true;}
   const s=lastGood.get(source);if(!s){coverage.push({source,connection:"unknown",coverage:"unsupported",collectedAt:null,lastActivityAt:null,reasonCode:invalid?"source_unavailable":null});continue;}
   const parsed=parseSnapshot(s,now);coverage.push(...parsed.coverage.map(c=>({...c,reasonCode:invalid?"invalid_spool":c.reasonCode})));agents.push(...parsed.agents);tasks.push(...parsed.tasks);events.push(...parsed.events);artifacts.push(...parsed.artifacts);
  }
  const dedupe=xs=>[...new Map(xs.map(x=>[x.id,x])).values()];const result=parseSnapshot({schemaVersion:1,snapshotId:randomUUID(),observedAt:new Date(now).toISOString(),coverage,agents:dedupe(agents),tasks:dedupe(tasks),events:dedupe(events).slice(0,2000),artifacts:dedupe(artifacts)},now);
  if(snapshotPath){await mkdir(resolve(snapshotPath,".."),{recursive:true,mode:0o700});await writeFile(snapshotPath+".tmp",JSON.stringify(result),{mode:0o600});await rename(snapshotPath+".tmp",snapshotPath);}return result;
 }
 // Serialize snapshot generation so concurrent clients cannot race the atomic writer.
 let queue=Promise.resolve();
 return http.createServer((req,res)=>{res.setHeader("Cache-Control","private, no-store");res.setHeader("Content-Type","application/json");const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.url!=="/agent-office-status")return send(404,{error:"not_found"});if(req.method!=="GET")return send(405,{error:"method_not_allowed"});
 const credential=req.headers.authorization||"",expected="Bearer "+token;if(credential.length!==expected.length||!timingSafeEqual(Buffer.from(credential),Buffer.from(expected)))return send(401,{error:"unauthorized"});
 queue=queue.catch(()=>{}).then(async()=>{try{send(200,await snapshot());}catch{send(503,{error:"source_unavailable"});}});
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const token=process.env.STATUS_ADAPTER_READ_TOKEN;if(token===process.env.JWT_SECRET)throw new Error("distinct_read_token_required");createServer({spoolDir:process.env.STATUS_SPOOL_DIR||"/home/aski/agent-office-status/spool",snapshotPath:process.env.STATUS_SNAPSHOT_PATH||"/home/aski/agent-office-status/snapshot.json",token}).listen(8460,"127.0.0.1");}
