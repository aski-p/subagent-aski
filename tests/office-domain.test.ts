import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceWorkflow,
  createOfficeState,
  pauseRun,
  restoreOfficeState,
  resumeRun,
  serializeOfficeState,
  startRun,
  stopRun,
} from "../lib/office-domain";

test("a mission starts one idempotent persisted workflow", () => {
  const draft = createOfficeState();
  const started = startRun(draft, {
    objective: "  실제 에이전트 오피스를 완성해줘  ",
    idempotencyKey: "mission-001",
  });

  assert.equal(started.run.status, "running");
  assert.equal(started.run.objective, "실제 에이전트 오피스를 완성해줘");
  assert.equal(started.workflow.filter((step) => step.status === "active").length, 1);
  assert.equal(started.workflow[0].id, "brief");
  assert.equal(started.workflow[0].status, "active");
  assert.equal(started.events[0].type, "run.started");

  const duplicate = startRun(started, {
    objective: "중복 클릭으로 생긴 다른 텍스트",
    idempotencyKey: "mission-001",
  });
  assert.deepEqual(duplicate, started);

  const restored = restoreOfficeState(serializeOfficeState(started));
  assert.deepEqual(restored, started);
});

test("pause blocks progress and resume continues from the checkpoint", () => {
  const started = startRun(createOfficeState(), {
    objective: "상태 머신을 검증해줘",
    idempotencyKey: "mission-002",
  });
  const progressed = advanceWorkflow(started, 40);
  assert.equal(progressed.workflow[0].progress, 40);

  const paused = pauseRun(progressed);
  assert.equal(paused.run.status, "paused");
  assert.deepEqual(advanceWorkflow(paused, 40).workflow, paused.workflow);

  const resumed = resumeRun(paused);
  const checkpointed = advanceWorkflow(resumed, 60);
  assert.equal(checkpointed.workflow[0].status, "done");
  assert.equal(checkpointed.workflow[1].status, "active");
  assert.equal(checkpointed.run.status, "running");
  assert.ok(checkpointed.events.some((event) => event.type === "checkpoint.created"));
});

test("stop preserves completed work and cancels future progress", () => {
  const started = startRun(createOfficeState(), {
    objective: "중지 동작을 검증해줘",
    idempotencyKey: "mission-003",
  });
  const checkpointed = advanceWorkflow(started, 100);
  const stopped = stopRun(checkpointed);

  assert.equal(stopped.run.status, "stopped");
  assert.equal(stopped.workflow[0].status, "done");
  assert.equal(stopped.workflow[0].progress, 100);
  assert.equal(stopped.workflow[1].status, "canceled");
  assert.ok(stopped.events.some((event) => event.type === "run.stopped"));
  assert.deepEqual(advanceWorkflow(stopped, 50).workflow, stopped.workflow);
});

test("invalid or incompatible persisted snapshots recover safely", () => {
  assert.deepEqual(restoreOfficeState("not-json"), createOfficeState());
  assert.deepEqual(
    restoreOfficeState(JSON.stringify({ schemaVersion: 999, run: { status: "running" } })),
    createOfficeState(),
  );
});
