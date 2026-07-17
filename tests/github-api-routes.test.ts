import assert from "node:assert/strict";
import test from "node:test";

import { GET as getProjects } from "../app/api/projects/route";
import { GET as getRuns } from "../app/api/projects/[repo]/runs/route";
import { GET as getPulls } from "../app/api/repo/pulls/route";

const originalFetch = globalThis.fetch;

function githubResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withFetch(fake: typeof fetch, callback: () => Promise<void>) {
  globalThis.fetch = fake;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("project discovery rejects private and malformed upstream repositories", { concurrency: false }, async () => {
  await withFetch(async () => githubResponse([
    { owner: { login: "aski-p" }, name: "public-repo", private: false, archived: false, fork: false, has_issues: true, html_url: "https://evil.example/project" },
    { owner: { login: "aski-p" }, name: "private-repo", private: true, archived: false, fork: false, has_issues: true },
  ]), async () => {
    const response = await getProjects();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.projects.map((project: { name: string }) => project.name), ["public-repo"]);
    assert.equal(data.projects[0].htmlUrl, "https://github.com/aski-p/public-repo");
  });
});

test("run discovery enforces the exact marker, durable status, IDs, state, and canonical URL", { concurrency: false }, async () => {
  const validBody = "Do work\n<!-- agent-office:v1 owner=aski-p repo=demo -->";
  await withFetch(async () => githubResponse([
    { id: 1, number: 11, title: "[Agent Office] valid", body: validBody, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }], state: "open", html_url: "https://evil.example/run" },
    { id: 2, number: 12, title: "[Agent Office] no marker", body: "none", user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }], state: "open" },
    { id: 3, number: 0, title: "[Agent Office] bad number", body: validBody, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }], state: "open" },
    { id: 4, number: 14, title: "[Agent Office] unknown", body: validBody, user: { login: "aski-p" }, labels: [], state: "open" },
    { id: 5, number: 15, title: "[Agent Office] conflicting", body: validBody, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }, { name: "agent-office:done" }], state: "open" },
    { id: 6, number: 16, title: "[Agent Office] closed active", body: validBody, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }], state: "closed" },
    { id: 7, number: 17, title: "[Agent Office] duplicate label", body: validBody, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }, { name: "AGENT-OFFICE:QUEUED" }], state: "open" },
    { id: 8, number: 18, title: "[Agent Office] case marker duplicate", body: `${validBody}\n<!-- AGENT-OFFICE:v1 owner=aski-p repo=demo -->`, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }], state: "open" },
    { id: 9, number: 19, title: "[Agent Office] spaced marker duplicate", body: `${validBody}\n<!--   agent-office:v1 owner=aski-p repo=demo -->`, user: { login: "aski-p" }, labels: [{ name: "agent-office:queued" }], state: "open" },
  ]), async () => {
    const response = await getRuns(new Request("http://localhost/api/projects/demo/runs"), { params: Promise.resolve({ repo: "demo" }) });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.runs.length, 1);
    assert.deepEqual(data.runs[0], {
      id: 1,
      number: 11,
      title: "valid",
      status: "queued",
      labels: ["agent-office:queued"],
      url: "https://github.com/aski-p/demo/issues/11",
      updatedAt: "",
      closed: false,
    });
  });
});

test("pull discovery rejects malformed/closed entries and generates canonical links", { concurrency: false }, async () => {
  await withFetch(async () => githubResponse([
    { id: 1, number: 7, title: "Open PR", state: "open", html_url: "https://evil.example/pr" },
    { id: 2, number: 8, title: "Closed PR", state: "closed", html_url: "https://github.com/aski-p/demo/pull/8" },
    { id: 3, number: 0, title: "Bad PR", state: "open", html_url: "https://github.com/aski-p/demo/pull/0" },
  ]), async () => {
    const response = await getPulls(new Request("http://localhost/api/repo/pulls?repo_name=demo"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{
      id: 1,
      number: 7,
      title: "Open PR",
      state: "open",
      html_url: "https://github.com/aski-p/demo/pull/7",
    }]);
  });
});

test("owner configuration must use the canonical case", { concurrency: false }, async () => {
  const previous = process.env.GITHUB_OWNER;
  process.env.GITHUB_OWNER = "ASKI-P";
  let calls = 0;
  try {
    await withFetch(async () => { calls += 1; return githubResponse([]); }, async () => {
      assert.equal((await getProjects()).status, 503);
      assert.equal((await getRuns(new Request("http://localhost/api/projects/demo/runs"), { params: Promise.resolve({ repo: "demo" }) })).status, 400);
    });
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previous;
  }
});

test("GitHub transport and JSON failures return controlled 502 responses", { concurrency: false }, async () => {
  await withFetch(async () => { throw new Error("network down"); }, async () => {
    const projectResponse = await getProjects();
    assert.equal(projectResponse.status, 502);
    assert.deepEqual(await projectResponse.json(), { error: "GitHub project list unavailable" });
  });
  await withFetch(async () => new Response("not-json", { status: 200 }), async () => {
    const runsResponse = await getRuns(new Request("http://localhost/api/projects/demo/runs"), { params: Promise.resolve({ repo: "demo" }) });
    assert.equal(runsResponse.status, 502);
    assert.deepEqual(await runsResponse.json(), { error: "Invalid GitHub run response" });
  });
  await withFetch(async () => new Response("not-json", { status: 200 }), async () => {
    const pullsResponse = await getPulls(new Request("http://localhost/api/repo/pulls?repo_name=demo"));
    assert.equal(pullsResponse.status, 502);
    assert.deepEqual(await pullsResponse.json(), { error: "Invalid GitHub PR response" });
  });
});
