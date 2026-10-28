import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = "http://localhost:3199";
const now = new Date().toISOString();
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
) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => console.error("PAGE ERROR", e));
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
    const top = await page
      .getByRole("button", { name: /Synthetic Beta/ })
      .boundingBox();
    assert.ok(top && top.y < 900, "work visible in first viewport");
    for (const source of sources)
      assert.equal(
        (await page.getByText(source, { exact: true }).count()) > 0,
        true,
      );
    assert.equal(
      await page.getByText("선택된 최근 기록만 확인", { exact: false }).count(),
      1,
    );
    assert.equal(await page.getByText("모델 확인 불가").count(), 1);
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
        return [...row.querySelectorAll("*")].every((e) => {
          const b = e.getBoundingClientRect();
          return b.left >= r.left - 1 && b.right <= r.right + 1;
        });
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
  await pub.getByLabel("프로젝트").selectOption("alpha");
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
  await stale.getByRole("status").waitFor();
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
  await stale.getByRole("status").waitFor({ state: "hidden" });
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
    await page.getByLabel("프로젝트").selectOption(privateLabel);
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
  await delayed.getByLabel("프로젝트").selectOption("alpha");
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
  await firstFailure.getByLabel("프로젝트").selectOption("alpha");
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
  await race.getByLabel("프로젝트").selectOption("alpha");
  await race.waitForTimeout(100);
  await race.getByLabel("프로젝트").selectOption("beta");
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
  await race.getByLabel("프로젝트").selectOption("alpha");
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
