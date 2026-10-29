import http from "node:http";
import {spawn} from "node:child_process";
import {isAbsolute} from "node:path";
import {parseCommandContext,parseCommandInput,parseCommandReceipt} from "../../lib/command-contract.ts";
import {readFile,stat,writeFile,rename,mkdir,open} from "node:fs/promises";
import {join,resolve} from "node:path";
import {timingSafeEqual,randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {parseSnapshot,SOURCES} from "../../lib/status-contract.ts";
import {parseProgress,parseProjectCatalog} from "../../lib/progress-contract.ts";
/** @param {{spoolDir:string,token:string,snapshotPath?:string,progressPath?:string,catalogPath?:string,commandToken?:string,commandDbPath?:string,commandCapabilityFile?:string,commandHelperPath?:string,commandPythonPath?:string,commandsEnabled?:boolean,commandMaintenanceCapabilityFile?:string,commandTimeoutMs?:number}} options */
export function createServer({spoolDir,token,snapshotPath=undefined,progressPath="/home/aski/agent-office-status/progress.json",catalogPath="/home/aski/agent-office-status/projects.json",commandToken=undefined,commandDbPath=undefined,commandCapabilityFile=undefined,commandHelperPath=undefined,commandPythonPath="/usr/bin/python3",commandsEnabled=false,commandMaintenanceCapabilityFile=undefined,commandTimeoutMs=8000}) {
 let lastCatalog=null;
 async function readBounded(path){
  const file=await open(path,"r");try{
   if((await file.stat()).size>1048576)throw Error("invalid_spool");
   const chunks=[];let size=0;
   for(;;){const buffer=Buffer.alloc(65536);const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,1048577-size),null);if(!bytesRead)break;size+=bytesRead;if(size>1048576)throw Error("invalid_spool");chunks.push(buffer.subarray(0,bytesRead));}
   return JSON.parse(Buffer.concat(chunks).toString());
  }finally{await file.close();}
 }
 async function progress(){
  let catalogState="unavailable";
  try{lastCatalog=parseProjectCatalog(await readBounded(catalogPath)).projects;catalogState="available";}catch{if(lastCatalog)catalogState="stale";}
  let data={schemaVersion:1,observedAt:new Date().toISOString(),catalogState:"unavailable",projects:[],runs:[],tasks:[],reports:[]};
  if(progressPath){try{data=parseProgress(await readBounded(progressPath));}catch(error){if(error.code!=="ENOENT")throw error;}}
  return parseProgress({...data,catalogState,projects:lastCatalog??[]});
 }
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

 // Commands use fixed local helper argv and stdin JSON; no shell or browser-selected paths.
 function matches(value,secret){if(!secret)return false;const a=Buffer.from(value||""),b=Buffer.from("Bearer "+secret);return a.length===b.length&&timingSafeEqual(a,b);}
 const commandConfigured=()=>commandsEnabled===true&&typeof commandToken==="string"&&commandToken.length>=32&&token.length>=24&&commandToken!==token&&![process.env.JWT_SECRET,process.env.GITHUB_CLIENT_SECRET].filter(Boolean).includes(commandToken)&&![process.env.JWT_SECRET,process.env.GITHUB_CLIENT_SECRET].filter(Boolean).includes(token)&&[commandDbPath,commandCapabilityFile,commandHelperPath,commandPythonPath].every(p=>typeof p==="string"&&isAbsolute(p));
 function helper(operation,payload,capability=commandCapabilityFile){
  return new Promise((resolveResult,reject)=>{
   const child=spawn(commandPythonPath,[commandHelperPath,"--db",commandDbPath,"--capability-file",capability,operation],{stdio:["pipe","pipe","ignore"],shell:false});
   let size=0,chunks=[],settled=false;
   const stop=()=>{child.kill("SIGKILL");};
   const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);stop();reject(Error("helper_unavailable"));};
   const timer=setTimeout(fail,commandTimeoutMs);
   child.on("error",fail);child.stdin.on("error",()=>{});
   child.stdout.on("data",chunk=>{size+=chunk.length;if(size>1048576){fail();return;}chunks.push(chunk);});
   child.on("close",code=>{if(settled)return;settled=true;clearTimeout(timer);try{resolveResult({code,data:JSON.parse(Buffer.concat(chunks).toString("utf8"))});}catch{reject(Error("helper_unavailable"));}});
   child.stdin.end(JSON.stringify(payload));
  });
 }
 const exact=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===keys.sort().join(",");
 async function commandRequest(req,send){
  if(!commandConfigured())return send(503,{error:"commands_disabled"});
  try{
   if(req.method==="GET"){
    const cursor=req.headers["x-office-cursor"];if(cursor!==undefined&&(typeof cursor!=="string"||!/^[-A-Za-z0-9_]{1,200}$/.test(cursor)))return send(400,{error:"invalid_input"});
    const result=await helper("command-list",cursor?{cursor}:{});if(result.code!==0||!exact(result.data,["receipts","nextCursor"]))throw Error();
    const checked=parseCommandContext({schemaVersion:1,csrfToken:"adapter",csrfExpiresAt:new Date(Date.now()+900000).toISOString(),...result.data});
    return send(200,{receipts:checked.receipts,nextCursor:checked.nextCursor});
   }
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"]||""))return send(415,{error:"unsupported_media_type"});
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return send(400,{error:"invalid_input"});chunks.push(chunk);}
   let body;try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)));if(!exact(body,["actor","input"])||body.actor!==69686315)throw Error();body.input=parseCommandInput(body.input);}catch{return send(400,{error:"invalid_input"});}
   const result=await helper("command-submit",{input:body.input}),data=result.data;
   if(result.code!==0){
    const codes={409:["conflict","equivalent_pending"],410:["already_processed"],429:["rate_limited"]};
    if(codes[data?.status]?.includes(data?.error)){
     if(data.status===429){if(!Number.isSafeInteger(data.retryAfter)||data.retryAfter<1||data.retryAfter>3600)throw Error();return send(429,{error:"rate_limited"},{"Retry-After":String(data.retryAfter)});}
     return send(data.status,{error:data.error});
    }
    throw Error();
   }
   if(!exact(data,["receipt","replayed"])||typeof data.replayed!=="boolean")throw Error();
   return send(data.replayed?200:202,{receipt:parseCommandReceipt(data.receipt),replayed:data.replayed});
  }catch{return send(503,{error:"source_unavailable",...(req.method==="POST"?{outcomeUnknown:true}:{})});}
 }

 // Serialize snapshot generation so concurrent clients cannot race the atomic writer.
 let queue=Promise.resolve();
 const server=http.createServer((req,res)=>{res.setHeader("Cache-Control","private, no-store");res.setHeader("Content-Type","application/json");const send=(status,data,headers={})=>{res.statusCode=status;for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(data));};
 const isProgress=req.url==="/agent-office-status?view=progress",isCommands=req.url==="/agent-office-status?view=commands";
 if(req.url!=="/agent-office-status"&&!isProgress&&!isCommands)return send(404,{error:"not_found"});
 if(!["GET",...(isCommands?["POST"]:[])].includes(req.method))return send(405,{error:"method_not_allowed"});
 const readAuth=matches(req.headers.authorization,token),writeAuth=matches(req.headers.authorization,commandToken);
 if(req.method==="POST"){if(readAuth)return send(403,{error:"forbidden"});if(!writeAuth)return send(401,{error:"unauthorized"});}
 else {if(writeAuth)return send(403,{error:"forbidden"});if(!readAuth)return send(401,{error:"unauthorized"});}
 if(isCommands){void commandRequest(req,send);return;}
 queue=queue.catch(()=>{}).then(async()=>{try{send(200,isProgress?await progress():await snapshot());}catch{send(503,{error:"source_unavailable"});}});
 });
 let maintenanceTimer;
 server.on("listening",()=>{if([commandDbPath,commandHelperPath,commandPythonPath,commandMaintenanceCapabilityFile].every(p=>typeof p==="string"&&isAbsolute(p))){
  const tick=async()=>{try{await helper("command-purge",{},commandMaintenanceCapabilityFile);}catch{/* fixed private maintenance failures never log payloads */}};
  void tick();maintenanceTimer=setInterval(()=>{void tick()},3600000);maintenanceTimer.unref();
 }});
 server.on("close",()=>{if(maintenanceTimer)clearInterval(maintenanceTimer)});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const token=process.env.STATUS_ADAPTER_READ_TOKEN;if(token===process.env.JWT_SECRET)throw new Error("distinct_read_token_required");createServer({spoolDir:process.env.STATUS_SPOOL_DIR||"/home/aski/agent-office-status/spool",snapshotPath:process.env.STATUS_SNAPSHOT_PATH||"/home/aski/agent-office-status/snapshot.json",catalogPath:process.env.STATUS_CATALOG_PATH||"/home/aski/agent-office-status/projects.json",progressPath:process.env.STATUS_PROGRESS_PATH||"/home/aski/agent-office-status/progress.json",token,commandsEnabled:process.env.OFFICE_WEB_COMMANDS_ENABLED==="true",commandToken:process.env.STATUS_ADAPTER_COMMAND_TOKEN,commandDbPath:process.env.OFFICE_COMMAND_DB_PATH,commandCapabilityFile:process.env.OFFICE_COMMAND_CAPABILITY_FILE,commandHelperPath:process.env.OFFICE_COMMAND_HELPER_PATH,commandPythonPath:process.env.OFFICE_COMMAND_PYTHON_PATH||"/usr/bin/python3",commandMaintenanceCapabilityFile:process.env.OFFICE_COMMAND_MAINTENANCE_CAPABILITY_FILE}).listen(8460,"127.0.0.1");}
