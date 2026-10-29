// Synthetic API fixtures against the real Next page; this is not runtime proof.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const now="2026-10-30T00:00:00.000Z";
const id="11111111-1111-4111-8111-111111111111";
const receipt={id,projectId:null,summary:"Owner command",state:"awaiting_input",processingStage:"handled",lastHandledAt:now,createdAt:now,updatedAt:now,expiresAt:"2027-10-30T00:00:00.000Z",runId:null,replyKind:"clarification",replySummary:"어느 범위인가요?",replyToCommandId:null,replyUpdatedAt:now,safeErrorCode:null};
try{
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:900}});let posts=[];let uncertain=true;let deny=false;let expire=false;
  await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated:true,owner:true}}));
  await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{error:"unavailable"}}));
  await page.route("**/api/office/progress",r=>r.fulfill({status:503,json:{error:"unavailable"}}));
  await page.route("**/api/office/commands",async r=>{
   if(deny)return r.fulfill({status:403,json:{error:"forbidden"}});
   if(r.request().method()==="GET")return r.fulfill({json:{schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-30T00:00:00.000Z",receipts:[receipt],nextCursor:null}});
   posts.push(r.request().postDataJSON());
   if(uncertain){uncertain=false;return r.fulfill({status:503,json:{error:"source_unavailable",outcomeUnknown:true}})}
   if(expire){expire=false;return r.fulfill({status:403,json:{error:"csrf_expired"}})}
   return r.fulfill({status:202,json:{receipt,replayed:false}});
  });
  await page.goto("http://localhost:3199");await page.getByText("어느 범위인가요?").waitFor();
  assert.equal(await page.getByText("Boss(총괄)").count(),1);
  assert.equal(await page.getByText("Owner command").count(),0);
  const area=page.getByLabel("Boss에게 보낼 내용");await area.fill("질문");await area.press("Enter");assert.equal(await area.inputValue(),"질문\n");
  await page.getByRole("button",{name:"이어 답변"}).click();assert.equal(await area.evaluate(el=>document.activeElement===el),true);
  await area.press("Control+Enter");await page.getByText(/접수 여부를 확인하지 못했습니다/).waitFor();
  assert.equal(posts.length,1);assert.equal(posts[0].replyToCommandId,id);
  await page.getByRole("button",{name:"같은 요청으로 확인"}).click();await page.getByText("요청이 접수되었습니다.").waitFor();
  assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);
  await area.fill("새 질문");await area.dispatchEvent("keydown",{key:"Enter",ctrlKey:true,isComposing:true});assert.equal(posts.length,2);
  expire=true;await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByText(/다시 확인한 뒤/).waitFor();
  assert.equal(await area.inputValue(),"새 질문");await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByText("요청이 접수되었습니다.").waitFor();
  assert.deepEqual(posts[2],posts[3]);
  await area.fill("가".repeat(4000));assert.equal(await area.inputValue(),"가".repeat(4000));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  deny=true;await page.getByRole("button",{name:"기록 새로고침"}).click();await page.getByText("내 팀의 업무를 확인하세요").waitFor();
  assert.equal(await page.getByText("어느 범위인가요?").count(),0);assert.equal(await page.getByLabel("Boss에게 보낼 내용").count(),0);
  await page.close();
 }
 console.log("synthetic command browser checks passed");
}finally{await browser.close()}
