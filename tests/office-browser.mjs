import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base="http://localhost:3199";
const now=new Date().toISOString();
const sources=["pgx-relay","pgx-codex","pgx-claude","windows-codex"];
const sample={schemaVersion:1,snapshotId:"synthetic",observedAt:now,coverage:sources.map((source,i)=>({source,connection:i===1?"stale":"connected",coverage:"metadata-only",collectedAt:now,lastActivityAt:null,reasonCode:i===1?"discovery_limited":null})),agents:[{id:"a",name:"Synthetic Alpha",roleId:"frame",parentId:null,provider:null,model:null,projectId:"alpha",currentTaskId:"task-a",status:"unknown",lastActivityAt:null,lastSeenAt:null,source:"pgx-codex"},{id:"b",name:"Synthetic Beta",roleId:"scout",parentId:null,provider:"Claude",model:"test-model",projectId:"beta",currentTaskId:null,status:"working",lastActivityAt:now,lastSeenAt:now,source:"pgx-claude"}],tasks:[{id:"task-a",projectId:"alpha",title:"Synthetic task",status:"qa",assigneeIds:["a"],source:"pgx-codex",sourceUrl:null,updatedAt:now}],events:[{id:"event-a",agentId:"a",taskId:"task-a",type:"task_started",publicSummary:"Synthetic event",occurredAt:now}],artifacts:[{id:"art-a",taskId:"task-a",kind:"verification",label:"Synthetic result",safeUrl:null,verifiedAt:now}]};
const browser=await chromium.launch({headless:true});
const screenshotDir=process.env.OFFICE_SCREENSHOTS||"/tmp/office-ui-screenshots";
await fs.mkdir(screenshotDir,{recursive:true});
async function pageFor(width, owner=true, responder=()=>({status:200,body:sample})){
 const page=await browser.newPage({viewport:{width,height:900}});page.on("pageerror",e=>console.error("PAGE ERROR",e));
 await page.route("**/api/auth/session",r=>r.fulfill({json:{authenticated:owner,owner}}));
 await page.route("**/api/projects",r=>r.fulfill({json:{projects:[]}}));
 await page.route("**/api/projects/*/runs",r=>r.fulfill({json:{runs:[]}}));
 await page.route("**/api/auth/logout",r=>r.fulfill({status:200,json:{ok:true}}));
 await page.route("**/api/office/snapshot",async r=>{const v=await responder();await r.fulfill({status:v.status,json:v.body}).catch(()=>{})});
 await page.clock.install();await page.goto(base);return page;
}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"viewport overflow")}
try {
 for(const width of [1440,390]){
  const out=await pageFor(width,false);await out.getByText("내 팀의 업무를 확인하세요").waitFor();assert.equal(await out.getByText("Synthetic Alpha").count(),0);await noOverflow(out);await out.screenshot({path:screenshotDir+"/signed-out-"+width+".png",fullPage:true});await out.close();
  const page=await pageFor(width);await page.getByText("Synthetic Alpha").waitFor();await noOverflow(page);
  for(const source of sources)assert.equal(await page.getByText(source,{exact:true}).count()>0,true);
  assert.equal(await page.getByText("선택된 최근 기록만 확인",{exact:false}).count(),1);
  assert.equal(await page.getByText("모델 확인 불가").count(),1);
  await page.screenshot({path:screenshotDir+"/owner-unknown-"+width+".png",fullPage:true});
  const row=page.getByRole("button",{name:/Synthetic Alpha/});await row.focus();await page.keyboard.press("Enter");await page.getByRole("dialog").waitFor();assert.equal(await page.locator(":focus").textContent(),"닫기");await page.keyboard.press("Tab");await page.keyboard.press("Shift+Tab");await page.keyboard.press("Escape");assert.equal(await page.getByRole("dialog").count(),0);assert.equal(await row.evaluate(e=>e===document.activeElement),true);await page.close();
 }
 // Stale recovery: force one failed poll, then a successful poll with the browser clock.
 const stale=await pageFor(1440);await stale.getByText("Synthetic Alpha").waitFor();let calls=0;
 await stale.unroute("**/api/office/snapshot");await stale.route("**/api/office/snapshot",r=>{calls++;return r.fulfill(calls===1?{status:503,json:{error:"source_unavailable"}}:{json:sample})});
 await stale.clock.fastForward(30000);await stale.getByRole("status").waitFor();assert.equal(await stale.getByText("Synthetic Alpha").count(),1);await stale.screenshot({path:screenshotDir+"/owner-stale-1440.png",fullPage:true});await stale.setViewportSize({width:390,height:900});await noOverflow(stale);await stale.screenshot({path:screenshotDir+"/owner-stale-390.png",fullPage:true});await stale.clock.fastForward(30000);await stale.getByRole("status").waitFor({state:"hidden"});await stale.close();
 for(const code of [401,403]){let calls=0;const denied=await pageFor(390,true,()=>({status:++calls===1?200:code,body:sample}));await denied.getByText("Synthetic Alpha").waitFor();await denied.clock.fastForward(30000);await denied.getByText("내 팀의 업무를 확인하세요").waitFor();assert.equal(await denied.getByText("Synthetic Alpha").count(),0);await denied.close()}
 // Old project request completes after new request, and cannot overwrite newer data.
 let release;let n=0;const held=new Promise(r=>release=r);
 const race=await pageFor(1440,true,async()=>{n++;if(n===2){await held;return {status:200,body:{...sample,agents:[{...sample.agents[0],name:"Obsolete response"}]}}}return {status:200,body:sample}});
 await race.getByText("Synthetic Alpha").waitFor();await race.getByLabel("프로젝트").selectOption("alpha");await race.waitForTimeout(100);await race.getByLabel("프로젝트").selectOption("beta");await race.getByText("Synthetic Beta").waitFor();release();await race.waitForTimeout(200);assert.equal(await race.getByText("Obsolete response").count(),0);
 // Pending request after logout cannot restore rows.
 let releaseLogout;const pending=new Promise(r=>releaseLogout=r);
 await race.unroute("**/api/office/snapshot");await race.route("**/api/office/snapshot",async r=>{await pending;await r.fulfill({json:sample}).catch(()=>{})});
 await race.getByLabel("프로젝트").selectOption("alpha");await race.waitForTimeout(100);await race.getByRole("button",{name:"로그아웃"}).click();releaseLogout();await race.waitForTimeout(200);assert.equal(await race.getByText("Synthetic Alpha").count(),0);assert.equal(await race.getByText("내 팀의 업무를 확인하세요").count(),1);await race.close();
 if(process.env.OFFICE_REAL_SNAPSHOT){const real=JSON.parse(await fs.readFile(process.env.OFFICE_REAL_SNAPSHOT,"utf8"));for(const width of [1440,390]){const page=await pageFor(width,true,()=>({status:200,body:real}));await page.getByText("연결과 업무 기록").waitFor();await page.waitForTimeout(300);await noOverflow(page);await page.screenshot({path:screenshotDir+"/owner-real-"+width+".png",fullPage:true});await page.screenshot({path:screenshotDir+"/owner-real-top-"+width+".png"});await page.close()}}
 console.log("browser checks passed; screenshots: "+screenshotDir);
} finally {await browser.close()}
