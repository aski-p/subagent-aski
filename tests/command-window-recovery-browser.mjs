// Synthetic 1,000-row boundary against the actual composer; no runtime command is sent.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const now="2026-10-30T00:00:00.000Z";
const id=n=>n.toString(16).padStart(8,"0")+"-1111-4111-8111-111111111111";
const receipt=n=>({id:id(n),projectId:"a",summary:"Owner command",state:"awaiting_input",processingStage:"classified",lastHandledAt:null,createdAt:now,updatedAt:now,expiresAt:"2027-10-30T00:00:00.000Z",runId:null,replyKind:"clarification",replySummary:"Question "+n,replyToCommandId:null,replyUpdatedAt:now,safeErrorCode:null});
try{
 for(const [mode,width] of [["held",1440],["unknown",375]]){
  const page=await browser.newPage({viewport:{width,height:900}});
  let rows=Array.from({length:1000},(_,i)=>receipt(1000-i)),posts=[],release,held=false,gets=0;
  const answer="explicit authenticated answer";
  const child={...receipt(2000),state:"accepted",processingStage:"not_received",replyKind:null,replySummary:null,replyUpdatedAt:null,replyToCommandId:id(500)};
  await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated:true,owner:true}}));
  await page.route("**/api/office/snapshot",r=>r.fulfill({status:503,json:{}}));
  await page.route("**/api/office/progress",r=>r.fulfill({json:{schemaVersion:1,observedAt:now,catalogState:"available",projects:[{id:"a",label:"A",repositoryUrl:null,visibility:"private"}],runs:[],tasks:[],reports:[]}}));
  await page.route("**/api/office/commands",async r=>{
   if(r.request().method()==="GET"){
    gets++;const cursor=r.request().headers()["x-office-cursor"],before=cursor?Number(cursor.slice(5)):Infinity;
    const remaining=rows.filter(x=>parseInt(x.id.slice(0,8),16)<before),slice=remaining.slice(0,50);
    return r.fulfill({json:{schemaVersion:1,csrfToken:"valid",csrfExpiresAt:"2027-10-30T00:00:00.000Z",receipts:slice,nextCursor:remaining.length>50?"older"+parseInt(slice.at(-1).id.slice(0,8),16):null}});
   }
   posts.push(r.request().postDataJSON());
   if(posts.length===1){
    rows=[child,...rows.map(x=>x.id===id(500)?{...x,state:"handled",processingStage:"handled",lastHandledAt:now}:x)];
    if(mode==="held"){held=true;await new Promise(resolve=>{release=resolve})}
    return r.fulfill({status:503,json:{error:"source_unavailable",outcomeUnknown:true}});
   }
   if(posts.length===2)return r.fulfill({status:200,json:{receipt:child,replayed:true}});
   return r.fulfill({status:400,json:{error:"invalid_input"}});
  });
  await page.goto(process.env.BROWSER_BASE_URL??"http://localhost:3199",{waitUntil:"domcontentloaded"});
  await page.locator("#command-"+id(1000)).waitFor();
  for(let n=2;n<=20;n++){
   await page.getByRole("button",{name:"이전 기록 더 보기"}).click();
   await page.locator("#command-"+id(1001-n*50)).waitFor();
  }
  assert.equal(await page.locator('[id^="command-"]').count(),1000);
  await page.locator("#command-"+id(500)).getByRole("button",{name:"이어 답변"}).click();
  const area=page.getByLabel("Boss에게 보낼 내용"),target=page.getByLabel("대상 프로젝트");
  await area.fill(answer);await page.getByRole("button",{name:"요청 보내기"}).click();
  if(mode==="held"){
   for(let i=0;!held&&i<100;i++)await page.waitForTimeout(10);
   assert(held);assert.equal(posts.length,1);
  }else await page.getByText(/접수 여부를 확인하지 못했습니다/).waitFor();
  rows.splice(1,0,receipt(1001));const before=gets;
  await page.getByRole("button",{name:"기록 새로고침"}).click();
  await page.getByText(/최신 1,000개 기록으로 이동했습니다/).waitFor();
  assert(gets-before<=21);
  // History navigation must not edit the frozen reply/project/text during either state.
  assert.equal(await page.getByRole("button",{name:"취소",exact:true}).count(),1);
  assert.equal(await page.getByRole("button",{name:"취소",exact:true}).isDisabled(),true);
  assert.equal(await area.inputValue(),answer);assert.equal(await target.inputValue(),"a");
  if(mode==="held"){release();await page.getByText(/접수 여부를 확인하지 못했습니다/).waitFor()}
  await page.getByRole("button",{name:"같은 요청으로 확인"}).click();
  await page.getByText("요청이 접수되었습니다.",{exact:true}).waitFor();
  assert.equal(posts.length,2);assert.deepEqual(posts[0],posts[1]);
  assert.equal(posts[1].text,answer);assert.equal(posts[1].projectId,"a");assert.equal(posts[1].replyToCommandId,id(500));
  assert.equal(await area.isEnabled(),true);
  // An ordinary definitive rejection still permits explicit cancellation.
  await page.locator("#command-"+id(499)).getByRole("button",{name:"이어 답변"}).click();
  await area.fill("ordinary answer");await page.getByRole("button",{name:"요청 보내기"}).click();
  await page.getByText("요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",{exact:true}).waitFor();
  const cancel=page.getByRole("button",{name:"취소",exact:true});
  assert.equal(await cancel.isEnabled(),true);await cancel.click();
  assert.equal(await page.getByText("이어 답변 중").count(),0);assert.equal(await target.isEnabled(),true);
  assert.equal(posts.length,3);
  await page.close();
 }
 console.log("synthetic 1000-window held/unknown exact-replay and explicit-cancel checks passed");
}finally{await browser.close()}
