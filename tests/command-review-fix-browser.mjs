// Synthetic API fixtures exercise the real Next page.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const date="2026-10-30T00:00:00.000Z",parentId="11111111-1111-4111-8111-111111111111",childId="22222222-2222-4222-8222-222222222222";
const parent={id:parentId,projectId:"a",summary:"Owner command",state:"awaiting_input",processingStage:"handled",lastHandledAt:date,createdAt:date,updatedAt:date,expiresAt:"2027-10-30T00:00:00.000Z",runId:null,replyKind:"clarification",replySummary:"범위는?",replyToCommandId:null,replyUpdatedAt:date,safeErrorCode:null};
const child={...parent,id:childId,state:"accepted",processingStage:"not_received",lastHandledAt:null,replyKind:null,replySummary:null,replyUpdatedAt:null,replyToCommandId:parentId};
try{
 for(const initial of ["","b"]){
  const page=await browser.newPage();let posts=[],committed=false;
  await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated:true,owner:true}}));
  await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{}}));
  await page.route("**/api/office/progress",r=>r.fulfill({json:{schemaVersion:1,observedAt:new Date().toISOString(),catalogState:"available",projects:["a","b"].map(id=>({id,label:id,repositoryUrl:null,visibility:"private"})),runs:[],tasks:[],reports:[]}}));
  await page.route("**/api/office/commands",async r=>{
   if(r.request().method()==="GET")return r.fulfill({json:{schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-30T00:00:00.000Z",receipts:committed?[{...parent,state:"handled"},child]:[parent],nextCursor:null}});
   posts.push(r.request().postDataJSON());
   if(!committed){committed=true;return r.fulfill({status:503,json:{error:"source_unavailable",outcomeUnknown:true}})}
   return r.fulfill({json:{receipt:child,replayed:true}});
  });
  await page.goto("http://localhost:3199");await page.getByText("범위는?").waitFor();
  const target=page.getByLabel("대상 프로젝트");await page.locator('select option[value="a"]').first().waitFor({state:"attached"});if(initial)await target.selectOption(initial);
  await page.getByRole("button",{name:"이어 답변"}).click();assert.equal(await target.inputValue(),"a");
  assert.equal(await target.isDisabled(),true);
  await page.getByLabel("Boss에게 보낼 내용").fill("전체");await page.getByRole("button",{name:"요청 보내기"}).click();
  await page.getByText(/접수 여부를 확인하지 못했습니다/).waitFor();assert.equal(posts[0].projectId,"a");assert.equal(posts[0].replyToCommandId,parentId);
  await page.getByRole("button",{name:"기록 새로고침"}).click();await page.getByText("처리됨").waitFor();
  await page.getByRole("button",{name:"같은 요청으로 확인"}).click();await page.getByText("요청이 접수되었습니다.").waitFor();
  assert.deepEqual(posts[0],posts[1]);assert.equal(await page.getByLabel("Boss에게 보낼 내용").isEnabled(),true);
  await page.close();
 }
 for(const status of [502,504,503]){
  const page=await browser.newPage();let posts=[];
  await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated:true,owner:true}}));
  await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{}}));await page.route("**/api/office/progress",r=>r.fulfill({status:503,json:{}}));
  await page.route("**/api/office/commands",r=>{if(r.request().method()==="GET")return r.fulfill({json:{schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-30T00:00:00.000Z",receipts:[],nextCursor:null}});
   posts.push(r.request().postDataJSON());return posts.length===1?r.fulfill({status,contentType:"text/html",body:"gateway error"}):r.fulfill({json:{receipt:{...child,projectId:null,replyToCommandId:null},replayed:true}})});
  await page.goto("http://localhost:3199");const area=page.getByLabel("Boss에게 보낼 내용");await area.fill("작업 요청");await page.getByRole("button",{name:"요청 보내기"}).click();
  await page.getByText(/접수 여부를 확인하지 못했습니다/).waitFor();assert.equal(await area.isDisabled(),true);
  await page.getByRole("button",{name:"같은 요청으로 확인"}).click();await page.getByText("요청이 접수되었습니다.").waitFor();assert.deepEqual(posts[0],posts[1]);await page.close();
 }
 console.log("review fix browser checks passed");
}finally{await browser.close()}
