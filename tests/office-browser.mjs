import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = "http://localhost:3199";
const now = new Date().toISOString();
const emptyProgress = {schemaVersion:1,observedAt:now,catalogState:"available",projects:[],runs:[],tasks:[],reports:[]};
const privateProgress = {...emptyProgress,projects:[{id:"alpha",label:"Synthetic private engine",repositoryUrl:"https://github.com/example/private-engine",visibility:"private"}]};
const sources = ["pgx-relay", "pgx-codex", "pgx-claude", "windows-codex"];
const sample = {
  schemaVersion: 1,
  snapshotId: "synthetic",
  observedAt: now,
  coverage: sources.map((source, i) => ({
    source,
    connection: i === 1 ? "stale" : "connected",
    coverage: "metadata-only",
    collectedAt: now,
    lastActivityAt: null,
    reasonCode: i === 1 ? "discovery_limited" : null,
  })),
  agents: [
    {
      id: "a",
      name: "Synthetic Alpha",
      roleId: "frame",
      parentId: "b",
      provider: null,
      model: null,
      projectId: "alpha",
      currentTaskId: "task-a",
      status: "unknown",
      lastActivityAt: null,
      lastSeenAt: null,
      source: "pgx-codex",
    },
    {
      id: "b",
      name: "Synthetic Beta",
      roleId: "scout",
      parentId: null,
      provider: "Claude",
      model: "test-model",
      projectId: "beta",
      currentTaskId: "task-b",
      status: "working",
      lastActivityAt: now,
      lastSeenAt: now,
      source: "pgx-claude",
    },
  ],
  tasks: [
    {
      id: "task-a",
      projectId: "alpha",
      title: "Synthetic task",
      status: "qa",
      assigneeIds: ["a"],
      source: "pgx-codex",
      sourceUrl: null,
      updatedAt: now,
    },
    {
      id: "task-b",
      projectId: "beta",
      title: "Beta task",
      status: "working",
      assigneeIds: ["b"],
      source: "pgx-claude",
      sourceUrl: null,
      updatedAt: now,
    },
  ],
  events: [
    {
      id: "event-a",
      agentId: "a",
      taskId: "task-a",
      type: "task_started",
      publicSummary: "Synthetic event",
      occurredAt: now,
    },
  ],
  artifacts: [
    {
      id: "art-a",
      taskId: "task-a",
      kind: "verification",
      label: "Synthetic result",
      safeUrl: "https://github.com/aski-p/example",
      verifiedAt: now,
    },
  ],
};
const browser = await chromium.launch({ headless: true });
const screenshotDir =
  process.env.OFFICE_SCREENSHOTS || "/tmp/office-ui-screenshots";
await fs.mkdir(screenshotDir, { recursive: true });
async function pageFor(
  width,
  owner = true,
  responder = () => ({ status: 200, body: sample }),
  projectFailure = false,
  progressResponder = () => ({status:200,body:emptyProgress}),
) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => console.error("PAGE ERROR", e));
  await page.route("**/api/office/commands", (r) => r.fulfill({status:503,json:{error:"commands_disabled"}}));
  await page.route("**/api/auth/session", (r) =>
    r.fulfill({ json: { authenticated: owner, owner } }),
  );
  await page.route("**/api/projects", (r) =>
    r.fulfill(
      projectFailure
        ? { status: 503, json: { error: "unavailable" } }
        : {
            json: {
              projects: [
                {
                  name: "alpha",
                  fullName: "aski-p/alpha",
                  htmlUrl: "https://github.com/aski-p/alpha",
                  updatedAt: now,
                },
              ],
            },
          },
    ),
  );
  await page.route("**/api/projects/*/runs", (r) =>
    r.fulfill({ json: { runs: [] } }),
  );
  await page.route("**/api/auth/logout", (r) =>
    r.fulfill({ status: 200, json: { ok: true } }),
  );
  await page.route("**/api/office/snapshot", async (r) => {
    const v = await responder();
    await r.fulfill({ status: v.status, json: v.body }).catch(() => {});
  });
  await page.route("**/api/office/progress", async (r) => {
    const v = await progressResponder();
    await r.fulfill({status:v.status,json:v.body}).catch(() => {});
  });
  await page.clock.install();
  await page.goto(base);
  return page;
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "viewport overflow",
  );
}
try {
  // Synthetic progress exercises the real dashboard; it is not live execution evidence.
  const lease = new Date(Date.parse(now) + 30000).toISOString();
  const run = {id:'run-a',bossId:'boss-a',bossLabel:null,projectId:'alpha',
    objectiveSummary:'Synthetic objective',planVersion:1,state:'working',
    verifiedPct:30,workerPct:90,updatedAt:now};
  const task = (id, role, provider, checkpoints) => ({
    id,runId:'run-a',parentTaskId:null,role,provider,requestedModel:null,observedModel:'test-model',
    state:'working',planVersion:1,verifiedPct:30,workerPct:90,blockerSummary:null,updatedAt:now,
    checkpoints,attempts:[{id:'attempt-'+id,state:'working',observedModel:'test-model',startedAt:now,endedAt:null}],
  });
  const criterion = {id:'criterion',label:'Synthetic criterion',weight:1,bossOnly:false,state:'pending',evidence:[]};
  const tasks = [task('frame-a','frame','codex',[criterion]), task('frame-b','frame','codex',[criterion]),
    task('scout-a','scout','claude',[])];
  const proof = {id:'proof-a',taskId:'frame-a',runId:'run-a',attemptId:'attempt-frame-a',
    planVersion:1,provider:'codex',source:'codex-native',state:'running',confirmedAt:now,leaseExpiresAt:lease};
  let observedAt = now;
  const progress = () => ({...privateProgress,observedAt,runs:[run],tasks,activityProofs:[proof]});
  const room = await pageFor(1280,true,()=>({status:200,body:sample}),false,()=>({status:200,body:progress()}));
  let mutationPosts = 0;
  room.on('request', request => {
    if (request.method()==='POST' && !request.url().endsWith('/api/auth/logout')) mutationPosts++;
  });
  await room.locator('.agent-lounge').waitFor();
  await room.locator('.filters select').first().selectOption('private:alpha');
  const frameRole = room.locator('.lounge-role').filter({hasText:'Frame(UI/UX)'});
  const scoutRole = room.locator('.lounge-role').filter({hasText:'Scout'});
  await frameRole.locator('.lounge-avatar--working').waitFor();
  assert.match(await frameRole.textContent(),/30%/);
  assert.doesNotMatch(await frameRole.textContent(),/90%/);
  assert.match(await scoutRole.textContent(),/— \/ 기준 없음/);
  assert.equal(await scoutRole.locator('.lounge-sweat').count(),0,'proofless task stays static');
  const frameInspector = room.locator('.lounge-inspector-row').filter({hasText:'Frame(UI/UX)'});
  await frameInspector.locator('select').selectOption('frame-b');
  assert.equal(await frameRole.locator('.lounge-avatar--unknown').count(),1);
  await frameInspector.getByRole('button',{name:'작업 보기'}).click();
  assert.match(await room.locator('.lounge-detail').textContent(),/frame-b/);
  await room.locator('.filters select').nth(1).selectOption('Claude');
  assert.equal(await room.locator('.lounge-detail').count(),0,'provider filter clears detail');
  assert.equal(await frameRole.locator('.lounge-avatar--idle').count(),1);
  assert.equal(await room.locator('.lounge-inspector-row').filter({hasText:'frame-b'}).count(),0);
  await room.locator('.filters select').nth(1).selectOption('');
  assert.match(await frameInspector.textContent(),/frame-a/,'filter change clears selection');
  await room.locator('.filters select').first().selectOption('alpha');
  assert.equal(await room.locator('.lounge-inspector-row').count(),0,'same-ID public project cannot expose private work');
  await room.locator('.filters select').first().selectOption('private:alpha');
  await frameRole.locator('.lounge-avatar--working').waitFor();
  await room.getByRole('button',{name:'움직임 일시정지'}).click();
  await room.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  observedAt = new Date(Date.parse(now)+31000).toISOString();
  const refreshed = room.waitForResponse(r => r.url().endsWith('/api/office/progress') && r.status() === 200);
  await room.clock.fastForward(31000);
  assert.equal((await (await refreshed).json()).observedAt, observedAt);
  await room.evaluate(() => {
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await frameRole.locator('.lounge-avatar--unknown').waitFor();
  assert.equal(await frameRole.locator('.lounge-sweat').count(),0,'expired proof never revives on fresh export');
  await room.getByRole('button',{name:'움직임 재개'}).click();
  assert.equal(await frameRole.locator('.lounge-avatar--unknown').count(),1);
  await frameInspector.getByRole('button',{name:'작업 보기'}).click();
  let releaseRoomProgress, markRoomPending, markRoomFinished;
  const heldRoomProgress = new Promise(r=>releaseRoomProgress=r);
  const roomPending = new Promise(r=>markRoomPending=r);
  const roomFinished = new Promise(r=>markRoomFinished=r);
  await room.unroute('**/api/office/progress');
  await room.route('**/api/office/progress',async r => {
    markRoomPending(); await heldRoomProgress;
    await r.fulfill({json:progress()}).catch(()=>{});
    markRoomFinished();
  });
  await room.clock.fastForward(30000);
  await roomPending;
  await room.getByRole('button',{name:'로그아웃'}).click();
  releaseRoomProgress();
  await roomFinished;
  await room.getByText('내 팀의 업무를 확인하세요').waitFor();
  assert.equal(await room.locator('.agent-lounge').count(),0);
  assert.equal(await room.locator('.lounge-detail').count(),0);
  assert.equal(mutationPosts,0,'room interactions never POST work or commands');
  await room.close();

  // Contract-sized unbroken Progress values must remain inside the mobile detail.
  const longId = 't'.repeat(128);
  const longModel = 'm'.repeat(300);
  const longLabel = 'c'.repeat(300);
  const longTask = {...task(longId,'frame','codex',[{...criterion,label:longLabel}]), observedModel:longModel, attempts:[{id:'long-attempt',state:'working',observedModel:longModel,startedAt:now,endedAt:null}]};
  const longProgress = {...privateProgress,runs:[run],tasks:[longTask]};
  const mobileDetail = await pageFor(375,true,()=>({status:200,body:sample}),false,
    ()=>({status:200,body:longProgress}));
  await mobileDetail.locator('.filters select').first().selectOption('private:alpha');
  const openDetail = mobileDetail.locator('.lounge-inspector-row').filter({hasText:'Frame(UI/UX)'})
    .getByRole('button',{name:'작업 보기'});
  await openDetail.focus();
  await mobileDetail.keyboard.press('Enter');
  const detail = mobileDetail.locator('.lounge-detail');
  await detail.waitFor();
  assert.equal(await detail.evaluate(e=>document.activeElement===e),true,'keyboard open focuses detail');
  assert.match(await detail.locator('h3').textContent(),new RegExp(longId));
  assert.match(await detail.locator('p').first().textContent(),new RegExp(longModel));
  assert.match(await detail.locator('li').first().textContent(),new RegExp(longLabel));
  const contained = await detail.evaluate(e => {
    const outer=e.getBoundingClientRect();
    return [...e.querySelectorAll('h3,p,li')].every(child => {
      const rect=child.getBoundingClientRect();
      return rect.left>=outer.left && rect.right<=outer.right && child.scrollWidth<=child.clientWidth;
    });
  });
  assert.equal(contained,true,'long detail text must fit its container');
  await noOverflow(mobileDetail);
  const closeDetail = detail.getByRole('button',{name:'닫기'});
  await closeDetail.focus();
  await mobileDetail.keyboard.press('Enter');
  assert.equal(await detail.count(),0);
  assert.equal(await openDetail.evaluate(e=>document.activeElement===e),true,'close returns focus to the same role button');
  await mobileDetail.close();

  // Private catalog identities never bind legacy records by string equality.
  const collision = await pageFor(1440, true, () => ({status:200,body:sample}), false, () => ({status:200,body:privateProgress}));
  await collision.getByText("Synthetic Alpha",{exact:true}).waitFor();
  let publicRunCalls = 0;
  await collision.unroute("**/api/projects/*/runs");
  await collision.route("**/api/projects/*/runs",r => {
    publicRunCalls++;
    return r.fulfill({json:{runs:[{id:101,title:"Independent public issue",url:"https://github.com/example/alpha/issues/101",updatedAt:now,status:"qa"}]}});
  });
  await collision.locator(".filters select").first().selectOption("private:alpha");
  await collision.getByText("GitHub 소스 보기",{exact:true}).waitFor();
  assert.equal(await collision.getByText("GitHub 소스 보기",{exact:true}).getAttribute("href"),"https://github.com/example/private-engine");
  assert.equal(await collision.locator(".roster-row").count(),0,"private id must not borrow legacy agents");
  assert.equal(await collision.locator(".task-list").getByText("Synthetic task",{exact:false}).count(),0,"private id must not borrow legacy tasks");
  assert.equal(await collision.getByText("확인된 작업이 없습니다.",{exact:true}).count(),1);
  assert.equal(publicRunCalls,0,"private selection must not request public runs");
  assert.equal(await collision.getByText("alpha 공개 작업",{exact:false}).count(),0);
  await collision.locator(".filters select").first().selectOption("alpha");
  await collision.getByText("Independent public issue",{exact:true}).waitFor();
  assert.ok(publicRunCalls>0,"public collision identity must remain selectable");
  assert.equal(await collision.getByText("Synthetic Alpha",{exact:true}).count(),1);
  assert.equal(await collision.getByText("GitHub 소스 보기",{exact:true}).count(),0);
  await collision.close();

  // A catalog-only project remains selectable with no agents or tasks.
  const zero = await pageFor(390,true,()=>({status:200,body:{...sample,agents:[],tasks:[]}}),false,()=>({status:200,body:privateProgress}));
  await zero.getByRole("button",{name:"로그아웃"}).waitFor();
  await zero.locator(".filters select").first().selectOption("private:alpha");
  await zero.getByText("GitHub 소스 보기",{exact:true}).waitFor();
  assert.equal(await zero.locator(".roster-row").count(),0);
  assert.equal(await zero.getByText("확인된 작업이 없습니다.",{exact:true}).count(),1);
  await noOverflow(zero);
  await zero.close();

  // Either private endpoint's auth failure clears the complete private view.
  for (const status of [401,403]) {
    let calls=0;
    const deniedProgress=await pageFor(390,true,()=>({status:200,body:sample}),false,()=>({status:++calls<=2?200:status,body:privateProgress}));
    await deniedProgress.getByText("Synthetic Alpha",{exact:true}).waitFor();
    await deniedProgress.locator(".filters select").first().selectOption("private:alpha");
    await deniedProgress.getByText("GitHub 소스 보기",{exact:true}).waitFor();
    await deniedProgress.clock.fastForward(30000);
    await deniedProgress.getByText("내 팀의 업무를 확인하세요").waitFor();
    assert.equal(await deniedProgress.getByText("Synthetic private engine",{exact:false}).count(),0);
    assert.equal(await deniedProgress.getByText("GitHub 소스 보기",{exact:true}).count(),0);
    assert.equal(await deniedProgress.getByText("Synthetic Alpha",{exact:true}).count(),0);
    assert.equal(await deniedProgress.locator(".filters select").first().count(),0);
    await deniedProgress.close();
  }

  // A pending progress response completing after logout cannot restore the catalog.
  const logoutProgress=await pageFor(1440,true,()=>({status:200,body:sample}),false,()=>({status:200,body:privateProgress}));
  await logoutProgress.getByText("Synthetic Alpha",{exact:true}).waitFor();
  await logoutProgress.locator(".filters select").first().selectOption("private:alpha");
  await logoutProgress.getByText("GitHub 소스 보기",{exact:true}).waitFor();
  let releaseProgress;
  let markPending;
  const heldProgress=new Promise(r=>releaseProgress=r);
  const startedProgress=new Promise(r=>markPending=r);
  await logoutProgress.unroute("**/api/office/progress");
  await logoutProgress.route("**/api/office/progress",async r=>{
    markPending();
    await heldProgress;
    await r.fulfill({json:privateProgress}).catch(()=>{});
  });
  await logoutProgress.clock.fastForward(30000);
  await startedProgress;
  await logoutProgress.getByRole("button",{name:"로그아웃"}).click();
  releaseProgress();
  await logoutProgress.waitForTimeout(200);
  assert.equal(await logoutProgress.getByText("내 팀의 업무를 확인하세요").count(),1);
  assert.equal(await logoutProgress.getByText("Synthetic private engine",{exact:false}).count(),0);
  assert.equal(await logoutProgress.getByText("GitHub 소스 보기",{exact:true}).count(),0);
  assert.equal(await logoutProgress.locator(".filters select").first().count(),0);
  await logoutProgress.close();

  for (const width of [1440, 390]) {
    const out = await pageFor(width, false);
    await out.getByText("내 팀의 업무를 확인하세요").waitFor();
    assert.equal(
      await out.getByText("Synthetic Alpha", { exact: true }).count(),
      0,
    );
    await noOverflow(out);
    await out.screenshot({
      path: screenshotDir + "/signed-out-" + width + ".png",
      fullPage: true,
    });
    await out.close();
    const page = await pageFor(width);
    await page.getByText("Synthetic Alpha", { exact: true }).waitFor();
    await noOverflow(page);
    assert.equal(
      await page
        .getByRole("button", { name: /Synthetic Alpha/ })
        .getByText("작업: Synthetic task")
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: /Synthetic Beta/ })
        .getByText("작업: Beta task")
        .count(),
      1,
    );
    assert.equal(await page.locator(".agent-lounge .lounge-role").count(), 6);
    assert.equal(await page.locator(".agent-lounge").evaluate(room =>
      !!(room.compareDocumentPosition(document.querySelector(".roster")) & Node.DOCUMENT_POSITION_FOLLOWING)), true,
      "shared office precedes the roster");
    const work = page.getByRole("button", { name: /Synthetic Beta/ });
    await work.scrollIntoViewIfNeeded();
    assert.equal(await work.isVisible(), true, "work remains reachable below the office");
    for (const source of sources)
      assert.equal(
        (await page.getByText(source, { exact: true }).count()) > 0,
        true,
      );
    assert.equal(
      await page.getByText("선택된 최근 기록만 확인", { exact: false }).count(),
      1,
    );
    assert.equal(await page.getByText("모델 미수집").count(), 1);
    await page.screenshot({
      path: screenshotDir + "/owner-unknown-" + width + ".png",
      fullPage: true,
    });
    const row = page.getByRole("button", { name: /Synthetic Alpha/ });
    await row.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.locator(":focus").textContent(), "닫기");
    await page.keyboard.press("Tab");
    assert.equal(
      await page.locator(":focus").textContent(),
      "Synthetic result",
    );
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").textContent(), "닫기");
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.locator(":focus").textContent(),
      "Synthetic result",
    );
    assert.equal(
      (await page.getByText("Synthetic Beta", { exact: true }).count()) > 0,
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await row.evaluate((e) => e === document.activeElement), true);
    await page.close();
  }
  // Mixed registered and unassigned sessions preserve exact selection and filter boundaries.
  for (const width of [1440, 375]) {
    const diagnostics = Array.from({length: 43}, (_, i) => ({...sample.agents[0],
      id: `unassigned-${i}`, name: i === 0 ? "Approved diagnostic" : null, roleId: null, projectId: null, currentTaskId: null,
      provider: "openai", model: `diagnostic-${i}-` + "x".repeat(120), parentId: null}));
    const data = {...sample, agents: [{...sample.agents[0], name:null}, {...sample.agents[0], id:"project-only", name:"Boss", roleId:null, currentTaskId:null}, ...diagnostics]};
    const page = await pageFor(width, true, () => ({status:200,body:data}), false, () => ({status:200,body:privateProgress}));
    let posts = 0;
    page.on("request", request => { if (request.method() === "POST") posts++; });
    await page.getByText("Frame(UI/UX)", {exact:true}).last().waitFor();
    const details = page.locator(".roster-diagnostics");
    await details.locator("summary").waitFor();
    assert.equal(await page.locator(".roster-row").count(),2);
    const projectRow = page.getByRole("button", {name:/Boss.*alpha/});
    assert.equal(await projectRow.locator(".unknown").textContent(),"B");
    assert.doesNotMatch(await projectRow.textContent(), /역할 확인 불가|프로젝트 확인 불가|작업: 확인 불가/);
    assert.equal(await details.locator("summary").textContent(),"미등록 세션 43개");
    assert.equal(await details.evaluate(e => e.open),false);
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await details.locator(".diagnostic-row").count(),20);
    assert.equal(await details.getByText("Approved diagnostic", {exact:false}).count(),1);
    const chosen = details.locator(".diagnostic-row").first();
    const model = await chosen.locator("small").textContent();
    await chosen.focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByRole("dialog").getByText(model, {exact:true}).count(),1);
    await page.keyboard.press("Escape");
    assert.equal(await chosen.evaluate(e => e === document.activeElement),true);
    await details.getByRole("button",{name:/미등록 세션 더 보기/}).click();
    await details.getByRole("button",{name:/미등록 세션 더 보기/}).click();
    assert.equal(await details.locator(".diagnostic-row").count(),43);
    await noOverflow(page);
    await page.screenshot({path:screenshotDir + "/roster-mixed-" + width + ".png",fullPage:true});
    await page.locator(".filters select").nth(1).selectOption("openai");
    assert.equal(await page.locator(".roster-row").count(),0);
    assert.equal(await page.locator(".roster-diagnostics summary").textContent(),"미등록 세션 43개");
    assert.equal(await page.locator(".roster-diagnostics").evaluate(e => e.open),false);
    await page.locator(".filters select").nth(1).selectOption("");
    await page.locator(".filters select").first().selectOption("private:alpha");
    assert.equal(await page.locator(".roster-diagnostics").count(),0);
    assert.equal(await page.locator(".roster-row").count(),0);
    await page.locator(".filters select").first().selectOption("");
    await page.locator(".roster-diagnostics summary").waitFor();
    assert.equal(await page.locator(".roster-diagnostics").evaluate(e => e.open),false);
    assert.equal(posts,0);
    await page.getByRole("button",{name:"로그아웃"}).click();
    assert.equal(await page.locator(".roster-diagnostics").count(),0);
    await page.close();
  }
  // Contract-sized labels must fit within their row, not be clipped.
  for (const width of [1440, 390]) {
    const long = "X".repeat(300);
    const data = {
      ...sample,
      agents: [
        {
          ...sample.agents[0],
          name: long,
          provider: long,
          model: long,
          projectId: long,
        },
      ],
    };
    const page = await pageFor(width, true, () => ({
      status: 200,
      body: data,
    }));
    await page.locator(".roster-row strong").first().waitFor();
    const bounds = await page
      .locator(".roster-row")
      .first()
      .evaluate((row) => {
        const r = row.getBoundingClientRect();
        // The atlas image is intentionally larger than its overflow-hidden avatar crop.
        // Check the crop itself and every visible label/cell, not its hidden pixels.
        return [...row.querySelectorAll("*")].filter(e => !(e instanceof HTMLImageElement && e.closest(".avatar"))).every((e) => {
          const b = e.getBoundingClientRect();
          return b.left >= r.left - 1 && b.right <= r.right + 1;
        }) && [...row.querySelectorAll(".avatar")].every(e => getComputedStyle(e).overflow === "hidden");
      });
    assert.equal(bounds, true, "long label cell clipped");
    await noOverflow(page);
    await page.close();
  }
  // Public evidence polls, keeps last good on failure, and recovers.
  const pub = await pageFor(1440);
  await pub.getByText("Synthetic Alpha", { exact: true }).waitFor();
  assert.equal(await pub.getByText("aski-p/alpha").count(), 1);
  let projectCalls = 0;
  await pub.unroute("**/api/projects");
  await pub.route("**/api/projects", (r) => {
    projectCalls++;
    return r.fulfill(
      projectCalls === 1
        ? { status: 429, json: { error: "limited" } }
        : {
            json: {
              projects: [
                {
                  name: "alpha",
                  fullName: "aski-p/alpha",
                  htmlUrl: "https://github.com/aski-p/alpha",
                  updatedAt: now,
                },
              ],
            },
          },
    );
  });
  let publicCalls = 0;
  await pub.unroute("**/api/projects/alpha/runs");
  await pub.route("**/api/projects/alpha/runs", (r) => {
    publicCalls++;
    return r.fulfill(
      publicCalls === 2
        ? { status: 429, json: { error: "rate limited" } }
        : {
            json: {
              runs: [
                {
                  id: 1,
                  title: publicCalls >= 3 ? "Recovered issue" : "Initial issue",
                  url: "https://github.com/aski-p/example/issues/1",
                  updatedAt: now,
                  status: "qa",
                },
              ],
            },
          },
    );
  });
  await pub.locator(".filters select").first().selectOption("alpha");
  await pub.getByText("Initial issue").waitFor();
  await pub.clock.fastForward(30000);
  await pub
    .getByText("GitHub 프로젝트 갱신 실패 또는 요청 제한.", { exact: false })
    .waitFor();
  assert.equal(await pub.getByText("aski-p/alpha").count(), 1);
  await pub
    .getByText("GitHub 작업 갱신 실패 또는 요청 제한.", { exact: false })
    .waitFor();
  assert.equal(await pub.getByText("Initial issue").count(), 1);
  await pub.clock.fastForward(30000);
  await pub.getByText("Recovered issue").waitFor();
  assert.equal(
    await pub
      .getByText("GitHub 프로젝트 갱신 실패 또는 요청 제한.", { exact: false })
      .count(),
    0,
  );
  assert.ok(projectCalls >= 2);
  assert.equal(
    await pub
      .getByText("GitHub 작업 갱신 실패 또는 요청 제한.", { exact: false })
      .count(),
    0,
  );
  assert.ok(publicCalls >= 3);
  await pub.close();
  // Stale recovery: force one failed poll, then a successful poll with the browser clock.
  const stale = await pageFor(1440);
  await stale.getByText("Synthetic Alpha", { exact: true }).waitFor();
  let calls = 0;
  await stale.unroute("**/api/office/snapshot");
  await stale.route("**/api/office/snapshot", (r) => {
    calls++;
    return r.fulfill(
      calls === 1
        ? { status: 503, json: { error: "source_unavailable" } }
        : { json: sample },
    );
  });
  await stale.clock.fastForward(30000);
  await stale.locator(".workspace").getByRole("status").waitFor();
  assert.equal(
    await stale.getByText("Synthetic Alpha", { exact: true }).count(),
    1,
  );
  await stale.screenshot({
    path: screenshotDir + "/owner-stale-1440.png",
    fullPage: true,
  });
  await stale.setViewportSize({ width: 390, height: 900 });
  await noOverflow(stale);
  await stale.screenshot({
    path: screenshotDir + "/owner-stale-390.png",
    fullPage: true,
  });
  await stale.clock.fastForward(30000);
  await stale.locator(".workspace").getByRole("status").waitFor({ state: "hidden" });
  await stale.close();
  for (const code of [401, 403]) {
    let calls = 0;
    const denied = await pageFor(390, true, () => ({
      status: ++calls === 1 ? 200 : code,
      body: sample,
    }));
    await denied.getByText("Synthetic Alpha", { exact: true }).waitFor();
    await denied.clock.fastForward(30000);
    await denied.getByText("내 팀의 업무를 확인하세요").waitFor();
    assert.equal(
      await denied.getByText("Synthetic Alpha", { exact: true }).count(),
      0,
    );
    await denied.close();
  }
  // Private-only project cannot become public evidence, or survive auth loss.
  for (const mode of ["logout", 401, 403]) {
    const privateLabel = "private-only-project-label";
    const data = {
      ...sample,
      agents: [{ ...sample.agents[0], projectId: privateLabel }],
      tasks: [],
    };
    let deny = false;
    const page = await pageFor(390, true, () => ({
      status: deny && mode !== "logout" ? mode : 200,
      body: data,
    }));
    await page.getByText("Synthetic Alpha", { exact: true }).waitFor();
    let privateRequests = 0;
    await page.route("**/api/projects/private-only-project-label/runs", (r) => {
      privateRequests++;
      return r.fulfill({ status: 404 });
    });
    await page.locator(".filters select").first().selectOption(privateLabel);
    await page.waitForTimeout(150);
    assert.equal(privateRequests, 0);
    assert.equal(
      await page
        .getByRole("heading", { name: privateLabel + " 공개 작업" })
        .count(),
      0,
    );
    if (mode === "logout")
      await page.getByRole("button", { name: "로그아웃" }).click();
    else {
      deny = true;
      await page.clock.fastForward(30000);
    }
    await page.getByText("내 팀의 업무를 확인하세요").waitFor();
    assert.equal(
      await page.getByText(privateLabel, { exact: false }).count(),
      0,
    );
    assert.equal(
      await page.getByText("Synthetic Alpha", { exact: true }).count(),
      0,
    );
    await page.close();
  }
  // A delayed public response cannot restore the selected heading after logout.
  const delayed = await pageFor(390);
  await delayed.getByText("Synthetic Alpha", { exact: true }).waitFor();
  let finishPublic;
  const pendingPublic = new Promise((r) => (finishPublic = r));
  await delayed.unroute("**/api/projects/alpha/runs");
  await delayed.route("**/api/projects/alpha/runs", async (r) => {
    await pendingPublic;
    await r
      .fulfill({
        json: {
          runs: [
            {
              id: 9,
              title: "Delayed public issue",
              url: "https://github.com/aski-p/alpha/issues/9",
              updatedAt: now,
              status: "qa",
            },
          ],
        },
      })
      .catch(() => {});
  });
  await delayed.locator(".filters select").first().selectOption("alpha");
  await delayed.waitForTimeout(150);
  await delayed.getByRole("button", { name: "로그아웃" }).click();
  finishPublic();
  await delayed.waitForTimeout(150);
  assert.equal(await delayed.getByText("alpha 공개 작업").count(), 0);
  assert.equal(await delayed.getByText("Delayed public issue").count(), 0);
  await delayed.close();
  const firstProjectsFailure = await pageFor(390, false, undefined, true);
  await firstProjectsFailure
    .getByText("GitHub 프로젝트 갱신 실패 또는 요청 제한.", { exact: false })
    .waitFor();
  assert.equal(
    await firstProjectsFailure
      .getByText("현재 기록을 불러올 수 없습니다.", { exact: false })
      .count(),
    1,
  );
  assert.equal(
    await firstProjectsFailure
      .getByText("마지막 정상 기록을 표시합니다.", { exact: false })
      .count(),
    0,
  );
  await firstProjectsFailure.close();
  // A first run failure has no last-good data to claim.
  const firstFailure = await pageFor(390);
  await firstFailure.getByText("Synthetic Alpha", { exact: true }).waitFor();
  await firstFailure.unroute("**/api/projects/alpha/runs");
  await firstFailure.route("**/api/projects/alpha/runs", (r) =>
    r.fulfill({ status: 404 }),
  );
  await firstFailure.locator(".filters select").first().selectOption("alpha");
  await firstFailure
    .getByText("현재 기록을 불러올 수 없습니다.", { exact: false })
    .waitFor();
  assert.equal(
    await firstFailure
      .getByText("마지막 정상 기록을 표시합니다.", { exact: false })
      .count(),
    0,
  );
  await firstFailure.close();
  // Old project request completes after new request, and cannot overwrite newer data.
  let release;
  let n = 0;
  const held = new Promise((r) => (release = r));
  const race = await pageFor(1440, true, async () => {
    n++;
    if (n === 2) {
      await held;
      return {
        status: 200,
        body: {
          ...sample,
          agents: [{ ...sample.agents[0], name: "Obsolete response" }],
        },
      };
    }
    return { status: 200, body: sample };
  });
  await race.getByText("Synthetic Alpha", { exact: true }).waitFor();
  await race.locator(".filters select").first().selectOption("alpha");
  await race.waitForTimeout(100);
  await race.locator(".filters select").first().selectOption("beta");
  await race.getByText("Synthetic Beta", { exact: true }).waitFor();
  release();
  await race.waitForTimeout(200);
  assert.equal(await race.getByText("Obsolete response").count(), 0);
  // Pending request after logout cannot restore rows.
  let releaseLogout;
  const pending = new Promise((r) => (releaseLogout = r));
  await race.unroute("**/api/office/snapshot");
  await race.route("**/api/office/snapshot", async (r) => {
    await pending;
    await r.fulfill({ json: sample }).catch(() => {});
  });
  await race.locator(".filters select").first().selectOption("alpha");
  await race.waitForTimeout(100);
  await race.getByRole("button", { name: "로그아웃" }).click();
  releaseLogout();
  await race.waitForTimeout(200);
  assert.equal(
    await race.getByText("Synthetic Alpha", { exact: true }).count(),
    0,
  );
  assert.equal(await race.getByText("내 팀의 업무를 확인하세요").count(), 1);
  await race.close();
  if (process.env.OFFICE_REAL_SNAPSHOT) {
    const real = JSON.parse(
      await fs.readFile(process.env.OFFICE_REAL_SNAPSHOT, "utf8"),
    );
    for (const width of [1440, 390]) {
      const page = await pageFor(width, true, () => ({
        status: 200,
        body: real,
      }));
      await page.getByText("연결과 업무 기록").waitFor();
      await page.waitForTimeout(300);
      await noOverflow(page);
      await page.screenshot({
        path: screenshotDir + "/owner-real-" + width + ".png",
        fullPage: true,
      });
      await page.screenshot({
        path: screenshotDir + "/owner-real-top-" + width + ".png",
      });
      await page.close();
    }
  }
  console.log("browser checks passed; screenshots: " + screenshotDir);
} finally {
  await browser.close();
}
