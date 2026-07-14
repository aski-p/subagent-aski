# Agent Office 제품·UX 기획서

## 1. 제품 정의

Agent Office는 여러 AI 서브에이전트를 실제 회사의 직원처럼 고용하고, 역할을 나누고, 진행 상황을 관찰하고, 추가 지시와 승인 판단을 내리는 관제 제품이다.

첫 버전의 목표는 “자유롭게 노는 NPC 시뮬레이션”이 아니라 **게임처럼 보이면서도 업무 상태를 신뢰할 수 있는 운영 UI**다. 오리지널 2.5D 셀 셰이딩 판타지 사무실을 사용하며 특정 게임의 캐릭터·문양·UI를 복제하지 않는다.

## 2. 기본 팀

| 역할 | 책임 | 주요 산출물 |
|---|---|---|
| Judgment PM | 목표 명확화, DAG 생성, 배정, 충돌 해결, 승인·재작업·종료 판단 | 실행 계획, 결정 기록, 최종 요약 |
| Planner | 요구를 PRD·유저 스토리·수용 기준으로 분해 | PRD, 사용자 흐름, 작업 목록 |
| UX/UI Designer | IA, 화면 흐름, 디자인 토큰과 모든 UI 상태 설계 | 화면 명세, 토큰, 인터랙션 사양 |
| Tech Lead | 아키텍처, API·데이터 모델, 구현 순서와 위험 검토 | 기술 설계서, 인터페이스 계약 |
| Developer | 코드 변경, 테스트, 빌드와 산출물 생성 | 코드, 테스트, 빌드 결과 |
| QA | 수용 기준 기반 검증과 회귀 테스트 | 테스트 결과, 재현 절차, 판정 |
| Researcher | 사실 확인, 레퍼런스, 기술 리스크 조사 | 근거가 포함된 조사 보고서 |

MVP 기본 인원은 PM, Planner, Designer, Developer, QA 5명이다. 같은 역할을 여러 명 고용할 수 있고 Tech Lead는 초기에는 PM 또는 Developer가 겸임할 수 있다.

## 3. 기본 업무 프로세스

1. 사용자가 목표, 제약, 작업 공간, 완료 기준을 입력한다.
2. PM과 Planner가 PRD와 작업 DAG를 만든다.
3. 선택적으로 범위·위험·비용 승인 게이트를 통과한다.
4. Designer와 Tech Lead가 UI 명세와 기술 설계를 병렬 진행한다.
5. PM이 충돌을 해소하고 구현 작업과 수용 기준을 확정한다.
6. Developer들이 격리된 worktree 또는 명확한 파일 소유권으로 병렬 구현한다.
7. lint, typecheck, unit test, build를 자동 실행한다.
8. QA가 기능·회귀·시각 검수한다. 실패하면 재현 정보와 함께 담당자에게 돌려보낸다.
9. Judgment PM이 결과·산출물·변경 파일·검증 결과를 취합하고 완료 여부를 결정한다.
10. merge와 deploy는 사용자 승인 후 별도 실행한다.

무한 루프 방지를 위해 작업 재시도는 기본 2회, QA↔개발 revision은 3회로 제한한다. 동일 오류 signature가 2회 반복되면 자동 중단하고 PM 또는 사용자에게 시도 내역과 선택지를 제시한다.

## 4. 상태 머신

### WorkflowRun

`draft → queued → running ↔ paused → stopping → stopped | completed | failed | awaiting_approval`

### Agent

`offline | idle | assigned | working | collaborating | blocked | paused | error | draining`

### Task

`backlog → ready → assigned → in_progress → review → qa → done`

예외 상태: `blocked | awaiting_approval | retrying | canceled | failed`

### 제어 의미

- 실행: 필수 역할과 연결 상태를 검증하고 계획·배정을 시작한다.
- 일시정지: 새 도구 호출과 새 단계 시작을 막고 현재 작업을 안전 체크포인트까지 마친 뒤 멈춘다.
- 중지: 실행 요청을 취소하고 미완료 작업을 종료하되 파일, 산출물, 로그는 보존한다.
- 재개: 마지막 안전 체크포인트부터 다시 진행한다.
- 추가 지시: 현재 task를 덮어쓰지 않고 `Instruction(revision=N+1)`로 기록한다. 기본은 체크포인트 후 적용하며 긴급 지시는 checkpoint 후 재계획한다.
- 해고: idle은 즉시 비활성화한다. busy는 기본 draining 처리하고, 강제 해고는 확인 후 task를 PM에게 반환한다.

## 5. 화면 구조

### 데스크톱

- 상단 Command Bar: 프로젝트 목표, 전체 상태, Run/Pause/Stop, 알림
- 좌측 Team Panel: 직원, 역할, 상태, 진행률, 고용
- 중앙 Office Canvas: 캐릭터, 역할별 구역, 공개 상태 말풍선
- 우측 Employee Drawer: 현재 업무, 로그, 산출물, 지시, 설정, 해고
- 하단 Workflow Rail: 단계와 담당자, 대기·차단·승인 상태

권장 폭은 좌측 236~260px, 중앙 가변, 우측 356~420px이다.

### iPhone

- 상단 실행 제어를 한 줄로 유지한다.
- 캐릭터 탭 시 상세 내용을 높이 70~80% 바텀시트로 연다.
- 팀 목록은 왼쪽 드로어로 연다.
- 사무실 이동은 장식이고 모든 핵심 조작은 목록과 바텀시트에서도 가능해야 한다.
- 실행, 추가 지시, 고용, 해고가 390px 폭에서 가로 페이지 스크롤 없이 동작해야 한다.

## 6. 캐릭터 상태 표현

| 상태 | 캐릭터 표현 | UI 표현 |
|---|---|---|
| idle | 천천히 배회·휴식 | 다음 업무 대기 |
| assigned | 작업대로 이동 | 새 업무 확인 중 |
| working | 역할별 작업 모션 | 작업명·진행률 |
| collaborating | 회의 구역으로 이동 | 협업 상대 표시 |
| blocked | 정지하고 경고 표시 | 차단 원인과 선택지 |
| awaiting approval | 손 들기·지속 말풍선 | 사용자 판단 필요 |
| paused | 애니메이션 정지 | 안전 체크포인트 표시 |
| error | 붉은 경고 아이콘 | 요약·재시도·로그 보기 |
| completed | 짧은 완료 연출 후 idle | 결과 보기 |
| offline | 흐리게 표시 | 연결·복구 상태 |

색상만으로 구분하지 않고 텍스트, 아이콘, 움직임을 함께 사용한다. 말풍선에는 chain-of-thought가 아니라 최근 공개 이벤트의 1~2문장 요약만 표시한다. 일반 말풍선은 최대 3개, 승인 요청과 오류는 해결 전까지 유지한다.

## 7. 직원 상세와 추가 지시

상단에는 이름, 역할, 상태, 모델, 현재 작업과 마지막 활동 시각을 표시한다.

탭:

- 현재 작업: 목표, 단계, 체크리스트, 진행률, 의존 작업, 예상 다음 단계
- 작업 목록: 대기·완료·차단 작업
- 산출물: 변경 파일, 문서, 이미지, 빌드
- 활동 기록: 공개 로그, 도구 결과, 판단 근거 요약
- 설정: 모델, 도구 권한, 자율성, 동시성, 승인 조건

추가 지시는 여러 줄 입력, 우선순위, 체크포인트 후 적용, 긴급 중단 옵션을 제공한다. 에이전트가 수락하기 전에는 수정·취소할 수 있으며, 수락 이후에는 원문·시간·revision을 audit log에 남긴다.

## 8. 고용·해고

고용 항목:

- 이름, 역할 템플릿, 업무 설명
- provider/model
- skills와 사용 가능 도구
- max concurrency와 자율성
- 승인 필요 조건
- 캐릭터 외형 preset

해고 규칙:

- 대기 직원은 즉시 해고할 수 있다.
- 작업 중 직원은 업무 이관, 작업 취소, 완료 후 해고 중 하나를 선택한다.
- 과거 산출물과 로그는 삭제하지 않는다.
- 마지막 PM 또는 필수 역할을 해고하면 대체 직원을 요구한다.

## 9. 데이터 모델

```ts
type Project = { id: string; name: string; goal: string; workspaceRef: string; defaultProvider: string; createdAt: string };
type WorkflowRun = { id: string; projectId: string; templateId: string; status: string; objective: string; progress: number; checkpointId?: string; budget?: number };
type Agent = { id: string; projectId: string; name: string; role: string; skills: string[]; provider: string; model: string; promptVersion: string; toolPolicy: string; maxConcurrency: number; status: string; currentTaskId?: string; active: boolean };
type Task = { id: string; runId: string; parentId?: string; title: string; description: string; assigneeId?: string; status: string; priority: string; dependencies: string[]; acceptanceCriteria: string[]; checklist: object[]; progress: number; revision: number; attempt: number; maxAttempts: number; workspaceScope: string[] };
type Instruction = { id: string; taskId: string; author: string; text: string; priority: string; interrupt: boolean; baseRevision: number; status: "queued" | "acknowledged" | "applied" | "rejected"; createdAt: string };
type Event = { id: string; runId: string; taskId?: string; agentId?: string; type: string; publicSummary: string; payloadRef?: string; timestamp: string };
type Artifact = { id: string; taskId: string; type: string; name: string; uri: string; version: number; checksum: string };
type Approval = { id: string; runId: string; taskId?: string; type: string; reason: string; options: string[]; status: string; requestedAt: string; resolvedBy?: string };
type Checkpoint = { id: string; runId: string; taskId?: string; gitShaOrPatchRef: string; taskSnapshot: object; createdAt: string };
```

## 10. 실패·승인·안전

- 네트워크, rate limit, worker crash는 동일 idempotency key로 exponential backoff 최대 2회 재시도한다.
- validation/test 실패는 실패한 수용 기준과 재현 로그를 붙여 재작업 task를 만든다.
- context overflow는 공개 요약, artifact, checkpoint만 새 job에 넘긴다.
- 파일 충돌은 ownership으로 예방하고 PM이 직렬화 또는 재배정한다.
- deploy/merge, secret 접근, 외부 메시지·결제, 파괴적 shell/DB 작업, 강제 해고, rollback, 예산·범위 초과는 사용자 승인을 요구한다.
- audit log는 지시, 승인, 도구 호출, 파일 변경을 append-only로 기록한다.

## 11. 접근성·반응형 수용 기준

- 캐릭터 또는 직원 카드 선택 후 300ms 안에 같은 직원의 상세 패널이 열린다.
- 캐릭터, 목록, 상세 패널의 상태와 작업명이 항상 일치한다.
- 빈 지시는 전송할 수 없고 실패해도 입력 초안을 보존한다.
- 실행 중복 클릭이 중복 run/job을 만들지 않는다.
- 일시정지 후 새 업무를 배정하지 않는다.
- 정지 이후에도 완료 산출물과 로그를 조회할 수 있다.
- 작업 중 직원 해고 시 이관·취소·완료 후 해고 중 하나를 요구한다.
- 390px iPhone, 200% 확대, 키보드 전용, VoiceOver, 모션 감소 환경에서 핵심 기능이 유지된다.
- 상태를 색만으로 구분하지 않는다.
- 캐릭터 캔버스와 동일한 정보를 가진 DOM 기반 직원 목록을 제공한다.

## 12. 구현 우선순위

### P0

반응형 레이아웃, 직원/캐릭터 선택 동기화, 상태 모델, 상세 패널, 추가 지시, Run/Pause/Stop, 고용/해고/이관, 이벤트 로그, 로딩·빈·오류 상태, 단일 서버 상태 소스.

### P1

역할별 애니메이션, 말풍선 우선순위·겹침 방지, 작업 의존 관계, 로그 필터, 모델·도구·자율성 설정, 재접속 복구.

### P2

사무실·캐릭터 커스터마이징, 워크플로우 템플릿, 비용·토큰·시간 분석, 작업 리플레이, 다중 프로젝트, 알림·승인 정책.
