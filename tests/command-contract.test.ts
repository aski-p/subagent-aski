import test from "node:test";
import assert from "node:assert/strict";
import {parseCommandInput,parseCommandReceipt,parseCommandContext} from "../lib/command-contract";
const id="123e4567-e89b-42d3-a456-426614174000";
const now="2026-01-01T00:00:00.000Z";
const input={schemaVersion:1,clientRequestId:id,projectId:null,text:" question "};
const receipt={id,projectId:null,summary:"Owner command",state:"accepted",processingStage:"not_received",
 lastHandledAt:null,createdAt:now,updatedAt:now,expiresAt:"2026-01-02T00:00:00.000Z",runId:null,
 replyKind:null,replySummary:null,replyToCommandId:null,replyUpdatedAt:null,safeErrorCode:null};
test("strict input trims Unicode codepoints and rejects authority and oversized bytes",()=>{
 assert.equal(parseCommandInput(input).text,"question");
 assert.equal(parseCommandInput({...input,text:"😀".repeat(4000)}).text.length,8000);
 for(const value of [{...input,actor:"boss"},{...input,confirmedProjectId:"catalog-project"},{...input,text:"\0"},{...input,text:" "},
 {...input,text:"😀".repeat(4001)},{...input,clientRequestId:"native-session"},{...input,replyToCommandId:null},
 {...input,schemaVersion:true}])assert.throws(()=>parseCommandInput(value));
});
test("receipts and context exact schemas, bounds, dates and projected run IDs",()=>{
 assert.deepEqual(parseCommandReceipt(receipt),receipt);
 assert.equal(parseCommandReceipt({...receipt,replyKind:"query_answer",replySummary:"😀".repeat(2000),replyUpdatedAt:now}).replySummary?.length,4000);
 for(const value of [{...receipt,raw:"private"},{...receipt,summary:"x".repeat(301)},{...receipt,runId:"native-run"},
 {...receipt,createdAt:"2026-02-30T00:00:00Z"},{...receipt,replySummary:"x".repeat(2001)},
 {...receipt,state:"executing"},{...receipt,safeErrorCode:"/private/path"}])assert.throws(()=>parseCommandReceipt(value));
 const context={schemaVersion:1,csrfToken:"a".repeat(43),csrfExpiresAt:now,receipts:[receipt],nextCursor:null};
 assert.deepEqual(parseCommandContext(context),context);
 assert.equal(parseCommandContext({...context,csrfToken:"a".repeat(220)+".signature"}).csrfToken.length,230);
 assert.throws(()=>parseCommandContext({...context,receipts:Array(51).fill(receipt)}));
 assert.throws(()=>parseCommandContext({...context,receipts:[receipt,receipt]}));
 assert.throws(()=>parseCommandContext({...context,actor:"boss"}));
});
