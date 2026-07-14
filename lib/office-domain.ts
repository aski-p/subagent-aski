export const OFFICE_SCHEMA_VERSION = 1 as const;

export type RunStatus = "draft" | "running" | "paused" | "stopped" | "completed";
export type WorkflowStatus = "pending" | "active" | "done" | "blocked" | "canceled";

export type WorkflowStep = {
  id: string;
  label: string;
  owner: string;
  status: WorkflowStatus;
  progress: number;
};

export type OfficeEvent = {
  id: string;
  type: string;
  publicSummary: string;
  occurredAt: string;
};

export type OfficeState = {
  schemaVersion: typeof OFFICE_SCHEMA_VERSION;
  run: {
    id: string | null;
    status: RunStatus;
    objective: string;
    progress: number;
    checkpoint: number;
  };
  workflow: WorkflowStep[];
  events: OfficeEvent[];
  processedIdempotencyKeys: string[];
};

const WORKFLOW_TEMPLATE: ReadonlyArray<Omit<WorkflowStep, "status" | "progress">> = [
  { id: "brief", label: "브리프", owner: "Judgment PM" },
  { id: "plan", label: "기획", owner: "Planner" },
  { id: "design", label: "디자인", owner: "Designer" },
  { id: "build", label: "개발", owner: "Developer" },
  { id: "qa", label: "QA", owner: "QA" },
  { id: "judge", label: "판단", owner: "Judgment PM" },
];

function freshWorkflow(): WorkflowStep[] {
  return WORKFLOW_TEMPLATE.map((step) => ({ ...step, status: "pending", progress: 0 }));
}

function event(type: string, publicSummary: string): OfficeEvent {
  const occurredAt = new Date().toISOString();
  return {
    id: `${type}-${occurredAt}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    publicSummary,
    occurredAt,
  };
}

function runProgress(workflow: WorkflowStep[]) {
  if (!workflow.length) return 0;
  return Math.round(workflow.reduce((total, step) => total + step.progress, 0) / workflow.length);
}

function stableRunId(idempotencyKey: string) {
  let hash = 2166136261;
  for (const character of idempotencyKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `run-${(hash >>> 0).toString(36)}`;
}

export function createOfficeState(): OfficeState {
  return {
    schemaVersion: OFFICE_SCHEMA_VERSION,
    run: { id: null, status: "draft", objective: "", progress: 0, checkpoint: 0 },
    workflow: freshWorkflow(),
    events: [],
    processedIdempotencyKeys: [],
  };
}

export function startRun(
  state: OfficeState,
  input: { objective: string; idempotencyKey: string },
): OfficeState {
  if (state.processedIdempotencyKeys.includes(input.idempotencyKey)) return state;
  const objective = input.objective.trim();
  if (!objective || !input.idempotencyKey.trim()) return state;

  const workflow = freshWorkflow();
  workflow[0] = { ...workflow[0], status: "active" };
  return {
    ...state,
    run: {
      id: stableRunId(input.idempotencyKey),
      status: "running",
      objective,
      progress: 0,
      checkpoint: 0,
    },
    workflow,
    events: [event("run.started", `“${objective}” 미션을 시작했어요.`), ...state.events],
    processedIdempotencyKeys: [...state.processedIdempotencyKeys, input.idempotencyKey],
  };
}

export function pauseRun(state: OfficeState): OfficeState {
  if (state.run.status !== "running") return state;
  return {
    ...state,
    run: { ...state.run, status: "paused" },
    events: [event("run.paused", "현재 체크포인트에서 프로젝트를 일시정지했어요."), ...state.events],
  };
}

export function resumeRun(state: OfficeState): OfficeState {
  if (state.run.status !== "paused") return state;
  return {
    ...state,
    run: { ...state.run, status: "running" },
    events: [event("run.resumed", "마지막 체크포인트부터 프로젝트를 재개했어요."), ...state.events],
  };
}

export function stopRun(state: OfficeState): OfficeState {
  if (state.run.status !== "running" && state.run.status !== "paused") return state;
  const workflow = state.workflow.map((step) => (
    step.status === "done" ? { ...step } : { ...step, status: "canceled" as const }
  ));
  return {
    ...state,
    run: { ...state.run, status: "stopped" },
    workflow,
    events: [event("run.stopped", "완료된 결과는 보존하고 미완료 작업을 중지했어요."), ...state.events],
  };
}

export function advanceWorkflow(state: OfficeState, amount: number): OfficeState {
  if (state.run.status !== "running" || !Number.isFinite(amount) || amount <= 0) return state;
  const activeIndex = state.workflow.findIndex((step) => step.status === "active");
  if (activeIndex < 0) return state;

  const workflow = state.workflow.map((step) => ({ ...step }));
  const active = workflow[activeIndex];
  active.progress = Math.min(100, active.progress + amount);
  const events = [...state.events];
  let checkpoint = state.run.checkpoint;
  let status: RunStatus = state.run.status;

  if (active.progress === 100) {
    active.status = "done";
    checkpoint += 1;
    events.unshift(event("checkpoint.created", `${active.label} 단계를 완료하고 체크포인트를 저장했어요.`));
    const next = workflow[activeIndex + 1];
    if (next) next.status = "active";
    else {
      status = "completed";
      events.unshift(event("run.completed", "모든 워크플로 단계를 완료했어요."));
    }
  }

  return {
    ...state,
    run: { ...state.run, status, checkpoint, progress: runProgress(workflow) },
    workflow,
    events,
  };
}

export function serializeOfficeState(state: OfficeState) {
  return JSON.stringify(state);
}

function isOfficeState(value: unknown): value is OfficeState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OfficeState>;
  return candidate.schemaVersion === OFFICE_SCHEMA_VERSION
    && !!candidate.run
    && Array.isArray(candidate.workflow)
    && Array.isArray(candidate.events)
    && Array.isArray(candidate.processedIdempotencyKeys);
}

export function restoreOfficeState(raw: string | null | undefined): OfficeState {
  if (!raw) return createOfficeState();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isOfficeState(parsed) ? parsed : createOfficeState();
  } catch {
    return createOfficeState();
  }
}
