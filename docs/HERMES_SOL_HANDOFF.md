# Hermes + GPT SOL 구현 지시서

아래의 “실행 프롬프트”를 Hermes + GPT SOL에 그대로 전달하면 현재 프런트엔드 프로토타입을 실제 서브에이전트 관제 시스템으로 확장할 수 있다.

## 실행 프롬프트

```text
현재 저장소의 Agent Office 프로토타입을 실제 Hermes 서브에이전트 오케스트레이터와 연결해 완성해줘.

반드시 먼저 README.md, docs/PRODUCT_SPEC.md, docs/HERMES_SOL_HANDOFF.md, app/page.tsx, app/globals.css를 읽고 현재 UI/UX와 동작을 보존한다. 특정 게임 IP를 복제하지 않는 오리지널 셀 셰이딩 판타지 사무실 디자인을 유지한다.

목표:
1. 현재 하드코딩된 agents, tasks, events, run state를 서버 상태로 교체한다.
2. Planner → Judgment PM → Designer/Tech Lead 병렬 → Developer → QA → Judgment PM Final의 DAG를 실제 실행한다.
3. 캐릭터 위치·말풍선·진행률은 서버 Event stream으로 갱신한다.
4. 캐릭터/직원 카드 클릭 시 현재 task, 체크리스트, 공개 로그, 산출물, 의존 작업을 표시한다.
5. 추가 지시는 기존 task를 덮어쓰지 말고 revision이 있는 Instruction 이벤트로 생성한다.
6. Run/Pause/Resume/Stop, Hire/Drain/Fire와 업무 이관을 구현한다.
7. 모든 mutation에 Idempotency-Key, task 수정에 expectedRevision을 적용한다.
8. 새로고침과 재연결 후에도 project/run/agent/task/event 상태를 복원한다.
9. chain-of-thought와 원시 토큰은 저장·표시하지 않고 publicSummary, tool start/end, 변경 파일, 테스트 결과만 공개한다.
10. deploy/merge, secret, 외부 메시지, 파괴적 작업은 Approval을 거친다.

구현 원칙:
- 프런트엔드에서 Hermes나 모델을 직접 호출하지 않는다.
- UI → Orchestrator API → HermesAdapter → Hermes/Model 구조를 사용한다.
- HermesAdapter는 provider/transport 차이를 숨기고 아래 execute 계약을 제공한다.
- 실제 진행률은 완료 체크리스트의 가중치 합으로 계산한다.
- pause는 안전 checkpoint 후 정지, stop은 결과물/로그 보존 후 미완료 task 취소다.
- QA 실패는 재현 정보와 실패 criterion을 포함한 재작업 task로 route한다.
- 동일 오류 반복과 QA 루프에 제한을 둔다.
- 모델/도구 호출에는 heartbeat, timeout, cancel, 최대 2회 retry를 적용한다.

작업 순서:
A. DB schema와 repository 계층
B. Orchestrator 상태 머신과 DAG scheduler
C. HermesAdapter와 mock adapter
D. REST mutation과 SSE 또는 WebSocket event stream
E. 현재 React UI를 서버 상태 hook으로 교체
F. 승인, 오류, 산출물, 재연결 상태 UI
G. unit/integration/e2e와 샘플 run 시나리오

첫 구현에서는 mock adapter로 전체 흐름을 끝까지 시연한 뒤 실제 Hermes adapter를 연결한다. UI를 전면 재작성하지 말고 현재 컴포넌트와 디자인을 점진적으로 분리한다.

완료 조건:
- 5명 기본 팀이 한 샘플 요청을 Plan→Design/Tech→Implement→QA→PM Final까지 완료한다.
- QA 실패 1회 후 Developer에게 재작업되어 통과하는 흐름을 자동 테스트한다.
- 추가 지시의 queued→acknowledged→applied/failed 상태가 UI에 보인다.
- Run/Pause/Resume/Stop이 서버 상태와 일치하고 중복 job을 만들지 않는다.
- busy 직원 해고 시 drain/transfer/cancel 중 하나를 요구한다.
- 브라우저 재접속 후 run/task/event가 복원된다.
- lint, typecheck, tests, production build가 통과한다.

각 단계마다 변경 파일, 테스트 결과, 남은 위험을 공개 요약으로 보고하고, 막히면 추측으로 우회하지 말고 원인·시도·선택지를 PM에게 올린다.
```

## HermesAdapter 실행 계약

```ts
type ExecuteAgentJob = {
  runId: string;
  taskId: string;
  attempt: number;
  idempotencyKey: string;
  agent: {
    id: string;
    role: string;
    systemPromptVersion: string;
  };
  model: string;
  objective: string;
  taskSpec: string;
  acceptanceCriteria: string[];
  contextRefs: string[];
  instructionRevision: number;
  tools: Array<{
    name: string;
    permission: "read" | "write" | "approve";
    workspaceScope: string[];
  }>;
  checkpointRef?: string;
  timeoutMs: number;
};

type AcceptedJob = { jobId: string; acceptedAt: string };

interface HermesAdapter {
  execute(input: ExecuteAgentJob): Promise<AcceptedJob>;
  cancel(jobId: string): Promise<void>;
  health(jobId: string): Promise<{ lastHeartbeatAt: string; state: string }>;
}
```

Hermes가 OpenAI-compatible endpoint라면 Adapter에서 system/user/tool message로 변환한다. gateway 또는 CLI만 제공되면 같은 계약을 gateway job이나 child process로 번역한다.

## 구조화 결과

```json
{
  "status": "completed | blocked | needs_approval | failed",
  "publicSummary": "사용자에게 보여줄 1~2문장",
  "completedChecklistIds": [],
  "artifacts": [],
  "handoff": {
    "toRole": "QA",
    "taskSpec": "검증할 작업 설명"
  },
  "blocker": {
    "code": "OPTIONAL_CODE",
    "message": "공개 가능한 차단 원인",
    "choices": []
  }
}
```

응답이 schema validation을 통과하지 않으면 원문을 UI에 노출하지 않고 correction 1회 후 실패 이벤트를 생성한다.

## REST API 초안

```text
POST   /api/projects
GET    /api/projects/:projectId/agents
POST   /api/projects/:projectId/agents
PATCH  /api/agents/:agentId
POST   /api/agents/:agentId/drain
DELETE /api/agents/:agentId?force=false

POST   /api/runs
GET    /api/runs/:runId
POST   /api/runs/:runId/pause
POST   /api/runs/:runId/resume
POST   /api/runs/:runId/stop

GET    /api/runs/:runId/tasks
PATCH  /api/tasks/:taskId
POST   /api/tasks/:taskId/instructions
GET    /api/runs/:runId/artifacts
POST   /api/approvals/:approvalId/resolve
GET    /api/runs/:runId/events
```

mutation은 `Idempotency-Key` 헤더를 요구하고 task update body는 `expectedRevision`을 포함한다.

## 실시간 이벤트

```text
run.state_changed
agent.state_changed
agent.moved
task.assigned
task.progress
task.blocked
task.completed
instruction.acknowledged
instruction.applied
approval.requested
artifact.created
log.public
error
```

이벤트 envelope:

```json
{
  "eventId": "evt_...",
  "runId": "run_...",
  "taskId": "task_...",
  "agentId": "agent_...",
  "type": "task.progress",
  "publicSummary": "로그인 화면 3/5 구현 중",
  "payload": {},
  "occurredAt": "2026-07-14T17:00:00+09:00"
}
```

클라이언트는 `eventId`로 중복 제거하며 재접속 시 마지막 처리 ID 이후부터 replay한다. heartbeat는 15초, 45초 무응답이면 degraded, timeout 이후 retry 정책을 적용한다.

## 권장 폴더 구조

```text
app/
  api/
  components/
  hooks/
  page.tsx
server/
  orchestrator/
  adapters/
  repositories/
  policies/
  events/
db/
  schema.ts
  migrations/
tests/
  unit/
  integration/
  e2e/
```

UI 컴포넌트 분리는 서버 연동 단계에서 진행하되 현재 시각적 회귀를 막기 위해 한 번에 전면 교체하지 않는다.
