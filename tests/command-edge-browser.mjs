// Synthetic fixtures exercise the real page, not the deployed runtime.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const id="11111111-1111-4111-8111-111111111111", oldId="22222222-2222-4222-8222-222222222222";
const now="2026-10-30T00:00:00.000Z";
const receipt={id:oldId,projectId:null,summary:"Owner command",state:"accepted",processingStage:"not_received",lastHandledAt:null,createdAt:now,updatedAt:now,expiresAt:"2027-10-30T00:00:00.000Z",runId:null,replyKind:null,replySummary:null,replyToCommandId:null,replyUpdatedAt:null,safeErrorCode:null};
try{
 const page=await browser.newPage({viewport:{width:375,height:900}});let mode="409",posts=[],cursors=[],authenticated=true,release;
 await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated,owner:authenticated}}));
 await page.route("**/api/auth/logout",r=>{authenticated=false;return r.fulfill({json:{}})});
 await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{}}));
 await page.route("**/api/office/progress",r=>r.fulfill({status:503,json:{}}));
 await page.route("**/api/office/commands",async r=>{
  if(r.request().method()==="GET"){
   const cursor=r.request().headers()["x-office-cursor"];cursors.push(cursor??null);
   return r.fulfill({json:{schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-30T00:00:00.000Z",receipts:cursor?[receipt]:[],nextCursor:cursor?null:"page2"}});
  }
  posts.push(r.request().postDataJSON());
  if(mode==="409")return r.fulfill({status:409,json:{error:"equivalent_pending",existingReceiptId:oldId}});
  if(mode==="410")return r.fulfill({status:410,json:{error:"already_processed"}});
  if(mode==="429")return r.fulfill({status:429,headers:{"Retry-After":"2"},json:{error:"rate_limited"}});
  if(mode==="hold"){await new Promise(resolve=>{release=resolve});return r.fulfill({status:202,json:{receipt:{...receipt,id},replayed:false}}).catch(()=>{})}
  return r.fulfill({status:202,json:{receipt:{...receipt,id},replayed:false}});
 });
 await page.goto("http://localhost:3199");const area=page.getByLabel("Boss에게 보낼 내용");await area.waitFor();
 await area.fill("중복");await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByRole("link",{name:"기존 요청 보기"}).click();
 await page.locator("#command-"+oldId).waitFor();assert(cursors.includes("page2"));assert.equal(posts.length,1);
 mode="410";await area.fill("만료");await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByText(/기록이 만료되었습니다/).waitFor();
 assert.equal(posts.length,2);await page.waitForTimeout(250);assert.equal(posts.length,2);
 mode="429";await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByText(/초 후 다시 시도/).waitFor();assert.notEqual(posts[1].clientRequestId,posts[2].clientRequestId);
 assert.equal(await page.getByRole("button",{name:"요청 보내기"}).isDisabled(),true);
 await page.waitForTimeout(2200);assert.equal(await page.getByRole("button",{name:"요청 보내기"}).isEnabled(),true);assert.equal(posts.length,3);
 mode="hold";await area.fill("비공개 대기");await area.dispatchEvent("compositionstart",{data:"한"});await area.dispatchEvent("keydown",{key:"Enter",ctrlKey:true,isComposing:true,keyCode:229});await area.dispatchEvent("keydown",{key:"Enter",ctrlKey:true,keyCode:229});
 assert.equal(posts.length,3);await area.dispatchEvent("compositionend",{data:"한"});await area.press("Control+Enter");await page.waitForFunction(()=>document.querySelector(".boss-send")?.disabled);
 assert.equal(posts.length,4);assert.equal(await page.getByLabel("대상 프로젝트").isDisabled(),true);await page.getByRole("button",{name:"로그아웃"}).click();await page.getByText("내 팀의 업무를 확인하세요").waitFor();release();await page.waitForTimeout(300);
 authenticated=true;await page.reload();await page.getByLabel("Boss에게 보낼 내용").waitFor();assert.equal(await page.getByLabel("Boss에게 보낼 내용").inputValue(),"");assert.equal(await page.getByText("비공개 대기").count(),0);assert.equal(await page.getByText("요청이 접수되었습니다.").count(),0);
 await page.close();console.log("synthetic command edge checks passed");
}finally{await browser.close()}
