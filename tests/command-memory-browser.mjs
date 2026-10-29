// Synthetic fixtures against real Next; originals must never persist in the API.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const now="2026-10-29T00:00:00.000Z",ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const receipt=id=>({id,projectId:null,summary:"Owner command",state:"accepted",processingStage:"not_received",lastHandledAt:null,createdAt:now,updatedAt:now,expiresAt:"2027-10-29T00:00:00.000Z",runId:null,replyKind:null,replySummary:null,replyToCommandId:null,replyUpdatedAt:null,safeErrorCode:null});
try{
 const page=await browser.newPage();let authenticated=true,posts=[],receipts=[],release,hold=false,deny=false;
 await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated,owner:authenticated}}));
 await page.route("**/api/auth/logout",r=>{authenticated=false;return r.fulfill({json:{}})});
 await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{}}));await page.route("**/api/office/progress",r=>r.fulfill({status:503,json:{}}));
 await page.route("**/api/office/commands",async r=>{
  if(deny)return r.fulfill({status:403,json:{error:"forbidden"}});
  if(r.request().method()==="GET"){const cursor=r.request().headers()["x-office-cursor"];return r.fulfill({json:{schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-29T00:00:00.000Z",receipts:cursor?receipts.slice(1):receipts.slice(0,1),nextCursor:!cursor&&receipts.length>1?"older":null}})}
  posts.push(r.request().postDataJSON());const next=receipt(ids[posts.length-1]);receipts=[next,...receipts];
  if(hold)await new Promise(resolve=>{release=resolve});
  return r.fulfill({status:202,json:{receipt:next,replayed:false}}).catch(()=>{});
 });
 await page.goto(process.env.BROWSER_BASE_URL??"http://localhost:3199");const area=page.getByLabel("Boss에게 보낼 내용");await area.waitFor();
 const prefix="<img src=x onerror=alert(1)>",first=prefix+"가".repeat(4000-prefix.length),second="두 번째 요청";
 for(const value of [first,second]){await area.fill(value);await page.getByRole("button",{name:"요청 보내기"}).click();await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Boss에게 보낼 내용"]')?.value==="")}
 assert.equal(posts.length,2);assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes("두 번째 요청")||JSON.stringify(sessionStorage).includes("두 번째 요청")||location.href.includes(encodeURIComponent("두 번째 요청"))),false);await page.getByRole("button",{name:"기록 새로고침"}).click();if(await page.getByRole("button",{name:"이전 기록 더 보기"}).count())await page.getByRole("button",{name:"이전 기록 더 보기"}).click();
 for(const [id,value] of [[ids[0],first],[ids[1],second]]){const row=page.locator("#command-"+id);await row.getByText("보낸 내용 보기").click();assert.equal(await row.locator("details p").textContent(),value);assert.equal(await row.locator("details img").count(),0)}
 await page.getByRole("button",{name:"기록 새로고침"}).click();await page.waitForTimeout(200);if(await page.getByRole("button",{name:"이전 기록 더 보기"}).count())await page.getByRole("button",{name:"이전 기록 더 보기"}).click();
 assert.equal(await page.locator("#command-"+ids[0]+" details p").textContent(),first);assert.equal(await page.locator("#command-"+ids[1]+" details p").textContent(),second);
 hold=true;await area.fill("늦게 도착하는 요청");await page.getByRole("button",{name:"요청 보내기"}).click();await page.waitForFunction(()=>document.querySelector(".boss-send")?.disabled);assert.equal(posts.length,3);
 await page.getByRole("button",{name:"로그아웃"}).click();await page.getByText("내 팀의 업무를 확인하세요").waitFor();release();await page.waitForTimeout(200);
 authenticated=true;await page.reload();await page.getByLabel("Boss에게 보낼 내용").waitFor();await page.locator("#command-"+ids[2]).waitFor();
 assert.equal(await page.getByText("보낸 내용 보기").count(),0);assert.equal(await page.getByText("두 번째 요청").count(),0);assert.equal(await page.getByText("늦게 도착하는 요청").count(),0);
 hold=false;await page.getByLabel("Boss에게 보낼 내용").fill("권한 확인");await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByText("보낸 내용 보기").waitFor();
 deny=true;await page.getByRole("button",{name:"기록 새로고침"}).click();await page.getByText("내 팀의 업무를 확인하세요").waitFor();assert.equal(await page.getByText("보낸 내용 보기").count(),0);
 await page.close();console.log("synthetic receipt memory checks passed");
}finally{await browser.close()}
