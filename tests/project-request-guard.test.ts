import assert from "node:assert/strict";
import test from "node:test";

import { beginProjectRequest, isCurrentProjectRequest, type ProjectRequestGuard } from "../lib/project-request-guard";

test("an in-flight response is invalid after switching repositories", () => {
  let guard: ProjectRequestGuard = { version: 0, repo: "" };
  const oldRequest = beginProjectRequest(guard, "old-repo");
  guard = oldRequest;
  assert.equal(isCurrentProjectRequest(guard, oldRequest), true);

  guard = beginProjectRequest(guard, "new-repo");
  assert.equal(isCurrentProjectRequest(guard, oldRequest), false);
  assert.equal(isCurrentProjectRequest(guard, guard), true);
});

test("a later request for the same repository supersedes an earlier request", () => {
  const first = beginProjectRequest({ version: 0, repo: "" }, "demo");
  const second = beginProjectRequest(first, "demo");
  assert.equal(isCurrentProjectRequest(second, first), false);
  assert.equal(isCurrentProjectRequest(second, second), true);
});
