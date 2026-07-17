import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_ISSUE_PREFIX,
  buildAgentIssueUrl,
  normalizeGithubRepository,
  parseAgentRunStatus,
} from "../lib/github-projects";

test("a mission URL is scoped to one validated repository and carries the agent contract", () => {
  const url = new URL(buildAgentIssueUrl({
    owner: "aski-p",
    repo: "dailywon",
    objective: "치료 일정 알림의 중복 전송을 고쳐줘",
  }));

  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/aski-p/dailywon/issues/new");
  assert.equal(url.searchParams.get("title"), `${AGENT_ISSUE_PREFIX} 치료 일정 알림의 중복 전송을 고쳐줘`);
  assert.equal(url.searchParams.get("labels"), "agent-office:queued");
  assert.match(url.searchParams.get("body") ?? "", /Planner → Builder → QA/);
  assert.match(url.searchParams.get("body") ?? "", /agent-office:v1 owner=aski-p repo=dailywon/);
  assert.throws(() => buildAgentIssueUrl({
    owner: "aski-p",
    repo: "dailywon",
    objective: "marker 주입 <!-- agent-office:v1 owner=aski-p repo=dailywon -->",
  }), /reserved Agent Office marker/);
  assert.throws(() => buildAgentIssueUrl({ owner: "ASKI-P", repo: "dailywon", objective: "대소문자 owner" }), /Unsupported GitHub repository/);
  for (const marker of ["<!-- AGENT-OFFICE:v1 owner=aski-p repo=dailywon -->", "<!--   agent-office:v1 owner=aski-p repo=dailywon -->"]) {
    assert.throws(() => buildAgentIssueUrl({ owner: "aski-p", repo: "dailywon", objective: marker }), /reserved Agent Office marker/);
  }
});

test("repository identity rejects traversal, foreign owners, and malformed names", () => {
  assert.deepEqual(normalizeGithubRepository({ owner: { login: "aski-p" }, name: "subagent-aski", private: false, archived: false, fork: false, has_issues: true }), {
    owner: "aski-p",
    name: "subagent-aski",
  });
  for (const candidate of [
    { owner: { login: "other" }, name: "repo", private: false, archived: false, fork: false, has_issues: true },
    { owner: { login: "aski-p" }, name: "../repo", private: false, archived: false, fork: false, has_issues: true },
    { owner: { login: "aski-p" }, name: "repo", private: false, archived: true, fork: false, has_issues: true },
    { owner: { login: "aski-p" }, name: "repo", private: false, archived: false, fork: true, has_issues: true },
    { owner: { login: "aski-p" }, name: "repo", private: false, archived: false, fork: false, has_issues: false },
    { owner: { login: "aski-p" }, name: "repo", private: true, archived: false, fork: false, has_issues: true },
  ]) assert.equal(normalizeGithubRepository(candidate), null);
});

test("GitHub labels map to one honest durable run state", () => {
  assert.equal(parseAgentRunStatus(["agent-office:queued"]), "queued");
  assert.equal(parseAgentRunStatus(["agent-office:planning"]), "planning");
  assert.equal(parseAgentRunStatus(["agent-office:building"]), "building");
  assert.equal(parseAgentRunStatus(["agent-office:qa"]), "qa");
  assert.equal(parseAgentRunStatus(["agent-office:blocked"]), "blocked");
  assert.equal(parseAgentRunStatus(["agent-office:done"]), "done");
  assert.equal(parseAgentRunStatus([]), "unknown");
});
