// Synthetic pages against the real composer; SQLite paging is covered separately.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const now="2026-10-30T00:00:00.000Z";
const id=n=>n.toString(16).padStart(8,"0")+"-1111-4111-8111-111111111111";
const receipt=n=>({id:id(n),projectId:null,summary:"Owner command",state:"awaiting_input",processingStage:"classified",lastHandledAt:null,createdAt:now,updatedAt:now,expiresAt:"2027-10-30T00:00:00.000Z",runId:null,replyKind:"clarification",replySummary:"Question "+n,replyToCommandId:null,replyUpdatedAt:now,safeErrorCode:null});
try{
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:900}});let rows=Array.from({length:55},(_,i)=>receipt(55-i)),posts=[],gets=0,holdNext=false,releaseHeld,held=false,cycle=false;
  await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated:true,owner:true}}));
  await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{}}));await page.route("**/api/office/progress",r=>r.fulfill({status:503,json:{}}));
  await page.route("**/api/office/commands",async r=>{
   if(r.request().method()==="GET"){
    gets++;const cursor=r.request().headers()["x-office-cursor"],before=cursor?Number(cursor.slice(5)):Infinity;
    const remaining=rows.filter(x=>parseInt(x.id.slice(0,8),16)<before),slice=remaining.slice(0,50);
    const response={schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-30T00:00:00.000Z",receipts:slice,nextCursor:cycle?"older8":remaining.length>50?"older"+parseInt(slice.at(-1).id.slice(0,8),16):null};
    if(holdNext){holdNext=false;held=true;await new Promise(resolve=>{releaseHeld=resolve})}
    return r.fulfill({json:response});
   }
   posts.push(r.request().postDataJSON());const next={...receipt(57),state:"received",processingStage:"received",replyKind:null,replySummary:null,replyUpdatedAt:null};
   rows=[next,...rows];return r.fulfill({status:202,json:{receipt:next,replayed:false}});
  });
  await page.goto(process.env.BROWSER_BASE_URL??"http://localhost:3199",{waitUntil:"domcontentloaded"});await page.locator("#command-"+id(55)).waitFor();
  await page.getByRole("button",{name:"이전 기록 더 보기"}).click();await page.locator("#command-"+id(1)).waitFor();
  await page.locator("#command-"+id(1)).getByRole("button",{name:"이어 답변"}).click();
  rows=rows.map(r=>r.id===id(1)?{...r,replySummary:"Updated oldest clarification"}:r);rows.unshift(receipt(56));
  await page.getByRole("button",{name:"기록 새로고침"}).click();
  await page.getByText("Updated oldest clarification").waitFor({timeout:4000});
  assert.equal(await page.getByLabel("대상 프로젝트").isDisabled(),true);
  assert.equal(await page.locator("#command-"+id(56)).count(),1);
  await page.getByRole("button",{name:"취소",exact:true}).click();
  holdNext=true;await page.getByRole("button",{name:"기록 새로고침"}).click();
  for(let i=0;!held&&i<100;i++)await page.waitForTimeout(10);
  assert(held);
  await page.getByLabel("Boss에게 보낼 내용").fill("new current request");
  await page.getByRole("button",{name:"요청 보내기"}).click();await page.getByText("요청이 접수되었습니다.",{exact:true}).waitFor();
  await page.locator("#command-"+id(57)).waitFor();
  releaseHeld();await page.waitForTimeout(100);
  assert.equal(await page.locator("#command-"+id(57)).count(),1);
  rows=rows.map(r=>r.id===id(57)?{...r,state:"handled",processingStage:"handled",replyKind:"query_answer",replySummary:"Latest answer",replyUpdatedAt:now,lastHandledAt:now}:r);
  await page.getByRole("button",{name:"기록 새로고침"}).click();await page.getByText("Latest answer").waitFor();
  assert.equal(await page.locator("#command-"+id(1)).count(),1);
  const rendered=await page.locator('[id^="command-"]').evaluateAll(nodes=>nodes.map(n=>n.id));
  assert.equal(rendered.length,57);assert.equal(new Set(rendered).size,57);assert.equal(posts.length,1);assert(gets<16);
  cycle=true;const before=gets;await page.getByRole("button",{name:"기록 새로고침"}).click();
  await page.getByText("대화 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",{exact:true}).waitFor();
  assert(gets-before<=3);assert.equal(await page.locator("#command-"+id(57)).count(),1);assert.equal(posts.length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.close();
 }
 console.log("synthetic recent paging and current state checks passed");
}finally{await browser.close()}
