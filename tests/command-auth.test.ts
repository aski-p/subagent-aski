import test from "node:test";
import assert from "node:assert/strict";
import {signSession} from "../lib/owner-auth";
import {issueCommandCsrf,verifyCommandCsrf} from "../lib/command-csrf";
import {GET,POST} from "../app/api/office/commands/route";
const secret="s".repeat(48), session=signSession(69686315,secret);
const input={schemaVersion:1,clientRequestId:"12345678-1234-4234-8234-123456789012",projectId:null,text:"hello"};
function config(){process.env.JWT_SECRET=secret;process.env.AUTH_ALLOWED_ORIGINS="https://office.example";process.env.OFFICE_WEB_COMMANDS_ENABLED="true";process.env.STATUS_ADAPTER_READ_TOKEN="r".repeat(40);process.env.STATUS_ADAPTER_COMMAND_TOKEN="w".repeat(40);process.env.STATUS_ADAPTER_URL="http://127.0.0.1:8460/agent-office-status";}
function request(body:unknown=input,headers:Record<string,string>={}){return new Request("https://office.example/api/office/commands",{method:"POST",headers:{cookie:"__Host-office_session="+session,origin:"https://office.example","content-type":"application/json","x-office-csrf":issueCommandCsrf(session,secret).token,...headers},body:typeof body==="string"?body:JSON.stringify(body)});}
test("CSRF purpose, expiry, signature and session are bound",()=>{const now=Date.now(),c=issueCommandCsrf(session,secret,now);assert.equal(Date.parse(c.expiresAt),now+900000);assert(verifyCommandCsrf(c.token,session,secret,now));for(const [token,cookie,time] of [[c.token,session,now+900000],[c.token,session+"x",now],[c.token+"x",session,now],[session,session,now]] as const)assert.equal(verifyCommandCsrf(token,cookie,secret,time),false);assert(!c.token.includes(session));});
test("owner, origin, csrf, input and default closed reject before upstream",async()=>{config();let calls=0;const old=fetch;globalThis.fetch=async()=>{calls++;return Response.json({})};try{
 for(const [headers,status] of [[{cookie:""},401],[{cookie:"__Host-office_session="+signSession(69686316,secret)},403],[{origin:""},403],[{origin:"https://evil.example"},403],[{"sec-fetch-site":"cross-site"},403],[{"x-office-csrf":""},403],[{"x-office-csrf":issueCommandCsrf(session,secret,Date.now()-900001).token},403],[{"x-office-csrf":issueCommandCsrf(session+"x",secret).token},403],[{"content-type":"text/plain"},415]] as [Record<string,string>,number][])assert.equal((await POST(request(input,headers))).status,status);
 for(const body of [{...input,text:"a".repeat(4001)},{...input,text:"a\u0000b"},{...input,actor:69686315},{...input,boss:"x"},{...input,model:"x"},"{"," ".repeat(16385)])assert.equal((await POST(request(body))).status,400);
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(" ".repeat(16385)));c.close()}});
 const streamed=new Request(request(),{body:stream,duplex:"half"} as RequestInit);assert.equal((await POST(streamed)).status,400);
 delete process.env.OFFICE_WEB_COMMANDS_ENABLED;assert.equal((await POST(request())).status,503);assert.equal((await GET(new Request("https://office.example/api/office/commands",{headers:{cookie:"__Host-office_session="+session}}))).status,503);assert.equal(calls,0);
 }finally{globalThis.fetch=old}});
test("owner context and submission use exact fixed view, opaque cursor header and safe errors",async()=>{config();const old=fetch;const seen:{url:string;init:RequestInit|undefined}[]=[];globalThis.fetch=async(url,init)=>{seen.push({url:String(url),init});return Response.json({receipts:[],nextCursor:null})};try{
 const req=new Request("https://office.example/api/office/commands",{headers:{cookie:"__Host-office_session="+session,"x-office-cursor":"abc_DEF"}});
 const r=await GET(req);assert.equal(r.status,200);assert.equal((await r.json()).receipts.length,0);assert.equal(seen[0].url,"http://127.0.0.1:8460/agent-office-status?view=commands");assert.equal(new Headers(seen[0].init?.headers).get("x-office-cursor"),"abc_DEF");assert.equal(seen[0].init?.redirect,"error");
 globalThis.fetch=async()=>{throw Error("secret raw body")};const failed=await POST(request());assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:"source_unavailable",outcomeUnknown:true});
 for(const suffix of ["?","?view=commands","#"]){process.env.STATUS_ADAPTER_URL="http://127.0.0.1:8460/agent-office-status"+suffix;assert.equal((await GET(req)).status,503)}
 }finally{globalThis.fetch=old}});

test("expired authentic CSRF is distinguished from wrong-session forgery",async()=>{config();const expired=issueCommandCsrf(session,secret,Date.now()-900001).token;
 for(const [token,code] of [[expired,"csrf_expired"],[issueCommandCsrf(session+"other",secret,Date.now()-900001).token,"csrf_invalid"],[expired+"x","csrf_invalid"]] as const){const r=await POST(request(input,{"x-office-csrf":token}));assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:code})}});
test("client preserves durable errors and rejects redirects, invalid, oversized or mixed-secret upstream",async()=>{config();const old=fetch;
 try{for(const [status,error] of [[409,"conflict"],[409,"equivalent_pending"],[410,"already_processed"],[429,"rate_limited"]] as const){globalThis.fetch=async()=>Response.json({error},{status,headers:{"Retry-After":"23"}});const r=await POST(request());assert.equal(r.status,status);assert.deepEqual(await r.json(),{error});if(status===429)assert.equal(r.headers.get("retry-after"),"23")}
 for(const source of [()=>new Response(null,{status:302,headers:{location:"https://evil.example"}}),()=>Response.json({receipt:{raw:"secret"},replayed:false},{status:202}),()=>new Response("x".repeat(1048577)),()=>new Response("{")]){globalThis.fetch=async()=>source();const r=await POST(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:"source_unavailable",outcomeUnknown:true})}
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({})};
 for(const token of [secret,"r".repeat(40),"short"]){process.env.STATUS_ADAPTER_COMMAND_TOKEN=token;assert.equal((await POST(request())).status,503)}assert.equal(calls,0);
 }finally{globalThis.fetch=old}});

test("429 requires an explicit bounded integer Retry-After before propagation",async()=>{
 config();const old=fetch;
 try{
  for(const retryAfter of [undefined,"","0","-1","1.5","3601","NaN","Infinity","23.0","1e2","+23","0x17"]){
   globalThis.fetch=async()=>Response.json({error:"rate_limited"},{status:429,headers:retryAfter===undefined?{}:{"Retry-After":retryAfter}});
   const response=await POST(request());
   assert.equal(response.status,503,"invalid Retry-After: "+String(retryAfter));
   assert.equal(response.headers.get("retry-after"),null);
   assert.deepEqual(await response.json(),{error:"source_unavailable",outcomeUnknown:true});
  }
  for(const retryAfter of ["1","23","3600"]){
   globalThis.fetch=async()=>Response.json({error:"rate_limited"},{status:429,headers:{"Retry-After":retryAfter}});
   const response=await POST(request());
   assert.equal(response.status,429);
   assert.equal(response.headers.get("retry-after"),retryAfter);
   assert.deepEqual(await response.json(),{error:"rate_limited"});
  }
 }finally{globalThis.fetch=old}
});
