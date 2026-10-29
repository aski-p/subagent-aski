import test from "node:test";
import assert from "node:assert/strict";
import {fetchCommandContext,sendBossCommand,CommandFetchError} from "../lib/command-browser";
test("context uses cursor header and submit returns receipt from envelope",async()=>{
 const old=globalThis.fetch;const calls:RequestInit[]=[];
 const now="2026-10-30T00:00:00.000Z";
 const receipt={id:"11111111-1111-4111-8111-111111111111",projectId:null,summary:"Owner command",state:"accepted",processingStage:"not_received",lastHandledAt:null,createdAt:now,updatedAt:now,expiresAt:now,runId:null,replyKind:null,replySummary:null,replyToCommandId:null,replyUpdatedAt:null,safeErrorCode:null};
 try{globalThis.fetch=async (_url,init)=>{calls.push(init!);return Response.json(calls.length===1?{schemaVersion:1,csrfToken:"csrf",csrfExpiresAt:now,receipts:[],nextCursor:null}:{receipt,replayed:false})};
 await fetchCommandContext(undefined,"abc");assert.equal((calls[0].headers as Record<string,string>)["X-Office-Cursor"],"abc");
 const result=await sendBossCommand({schemaVersion:1,clientRequestId:receipt.id,projectId:null,text:"질문"},"csrf");assert.equal(result.id,receipt.id);assert.equal((calls[1].headers as Record<string,string>)["X-Office-CSRF"],"csrf");
 }finally{globalThis.fetch=old}
});
test("unknown outcome remains distinguishable",async()=>{const old=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({error:"source_unavailable",outcomeUnknown:true},{status:503});await assert.rejects(sendBossCommand({schemaVersion:1,clientRequestId:"11111111-1111-4111-8111-111111111111",projectId:null,text:"질문"},"csrf"),(e:unknown)=>e instanceof CommandFetchError&&e.outcomeUnknown)}finally{globalThis.fetch=old}});
