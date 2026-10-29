# Boss 업무 분담 · GPT/Claude 진행률 설계

상태: 사용자 설계 승인 완료. 2026-10-29 사용자 지시 “설계대로 구현 진행”에 따라 격리 작업 공간에서 구현한다.

## 사용자 의도와 결정
사용자는 Codex의 Boss 대화창에서 일을 지시하고, GPT와 Claude 작업자가 실제로 나누어 수행하며, 웹 Agent Office에서 각 진행률을 보고, 최종 퍼센트 표를 원래 Boss 세션에 자동 보고하길 원한다. 사용자 선택: “Codex 대화창에서 지시·보고, 웹에서 진행률 확인”. 웹 명령 입력/실행 서비스는 이번 범위에서 제외한다. 기존 개인용 owner 로그인과 읽기 전용 상태 경로를 유지한다.

## 현재 상태와 차이
기존 SnapshotV1은 실제 provider/model/parent/task/start/complete 관측 기록만 제공한다. 진행률, Boss 업무 묶음, 검증 체크포인트, 자동 보고 영수증이 없다. legacy office-domain의 숫자 증가 방식은 실제 작업률 근거로 사용하지 않는다. 기존 기록은 계속 기록으로 표시하며 소급해 퍼센트를 만들지 않는다. 기존 원본 대화/인증 정보는 수집하지 않는다.

## 접근법과 선택
A. 기존 Codex Boss + Codex 네이티브 작업자 + 실제 Claude CLI 작업자 + 공통 완료 체크포인트 장부. 웹은 읽기만 한다. 사용자가 선택한 흐름에 맞고 현재 앱/로그인을 유지한다.
B. 웹 명령 + 전용 PGX Boss runner. 새 실행 서비스와 웹 제어가 필요하며 기존 Codex 대화와 다르다. 이번에는 선택하지 않았다.
A를 선택한다. 이번 확인에서 Windows 설치 Codex의 queue --help와 공식 Developer commands가 기존 session UUID로 메시지 큐잉을 지원함을 확인했다. 실제 현재 Boss로의 전달/소비는 구현 수용검사에서 검증해야 한다. 별도 app-server로 임의 데스크톱 세션을 통제하지 않는다.

## 역할 · 실제 제공자
Boss는 원래 Codex 부모 대화다. 역할, 제공자, 실제 실행 모델은 별도 필드다.
- Atlas / Codex 6.1 Sol medium: 목표를 작업·완료 기준·가중치로 분해하고 의존성을 정한다.
- Forge / Claude: 주 구현과 오류 수정.
- Frame / Codex 6.1 Terra: 화면 구현과 실제 브라우저 확인.
- Palette / Claude: 캐릭터 아트 방향, SVG/CSS·이미지 프롬프트. 래스터 생성은 필요한 경우 이미지 도구에 별도 위임한다.
- Scout / Claude: 자료 조사·기술 확인·데이터 조사.
- Sentinel / Codex 6.1 Sol: 독립 검증과 완료 근거 확인.
매 업무마다 필요 역할만 실행하고 같은 일을 양쪽에 중복 발주하지 않는다. Claude는 이름만 붙인 GPT 작업자가 아닌 실제 Claude CLI/도구 실행으로 provider와 세션ID를 확인한다. Codex native spawn 모델에 Claude를 넣지 않는다. 모델 버전은 실제 관측/실행 결과를 표시하고 추측하지 않는다. 실패 시 제공자를 자동으로 바꿔 성공한 것으로 꾸미지 않는다.

## Boss 실행 흐름
1. Boss가 사람의 요청을 받아 objective와 대상 프로젝트를 기록하고 runId, 원래 Boss UUID, 작업ID, 담당자, 완료 항목을 만든다. 현재 Boss의 UUID는 명시적인 실행 환경/호출 정보로 바인딩한다. 최신 활성 대화나 이름 유사도로 찾지 않는다.
2. Codex는 네이티브 자식으로, Claude는 감독되는 실제 CLI로 실행한다. 각 attemptId와 실제 providerSessionId/parentTaskId를 연결한다. 코드 작업은 독립 작업 공간/브랜치를 사용한다. 의존 작업은 선행 결과 후 실행한다.
3. 작업자는 고정된 helper/MCP 보고 도구로 항목 시작·완료·막힘과 결과물을 보고한다. 자유 텍스트 전체/명령 로그를 상태 API로 복사하지 않는다. 동일 run/task/attempt/checkpoint/event 키는 멱등 처리한다.
4. Sentinel/명시된 검사자가 항목별 근거를 검증한다. 작업자의 완료 선언과 검증 승인을 구분한다. 실패/막힘은 원인을 기록하고 Boss에게 보낸다.
5. 완료·실패·실제 사용자 조치 필요 시 요약 표를 생성하고 원래 Boss UUID에 보낸다. 진행률 숫자가 바뀔 때마다 대화를 깨우지 않는다. 자식 결과가 이미 Boss에 도착했다면 보고를 중복 전송하지 않는다.
6. Boss가 표를 읽고 최종 승인 후 사용자에게 정리한다. 반복적인 새 작업 요청 없이 일회 작업은 종료한다. 다음 사용자 지시마다 새 runId로 같은 흐름을 재사용한다.

## 진행률 의미
표의 기본 숫자는 “검증된 완료율”이다. 작업 시작 전에 정의한 완료 항목 가중치 합100을 사용한다.
verifiedPct = 승인된 항목 가중치 합 / 전체 항목 가중치 합 ×100.
workerPct는 작업자가 완료 보고한 항목의 비율로 상세에 따로 표시한다. 표에 나온 숫자가 어느 쪽인지 명시한다. 경과 시간, 토큰 수, tool 호출 횟수, 마지막 heartbeat로 숫자를 증가시키지 않는다. 아직 완료 기준이 없는 과거 작업은 —/기준 없음이다.
전체 업무의 비율은 작업별 사전 가중치로 계산한다. 의존 작업 대기는 대기 상태이며 임의의 작업률을 부여하지 않는다. 막힘/실패 시 이미 승인된 항목을 유지한다. 재시도는 새 attemptId로 분리하고 유효한 근거만 유지한다. 범위가 바뀌면 분모/계획 버전을 표시한다. 재검증 실패로 승인 취소 시 숫자 하락 사유를 표시한다.
최종 Boss 승인을 별도의 양수 가중치 필수 항목으로 계획에 포함한다. 이 항목은 Boss만 승인하며 작업자/Sentinel이 대신 승인하지 않는다. 따라서 검증 작업이 끝나도 Boss 승인 전에는 100%가 되지 않는다. 100%는 요청된 모든 필수 항목과 최종 Boss 승인이 끝난 상태다. 구현 완료와 검수 완료, 배포 완료는 서로 구분한다. 배포는 요청 범위에 포함된 경우에만 완료 항목이 된다.

## 웹 화면
로그인 후 최상단에 “Boss 업무” 영역: 목표, 원래 Boss 이름, 전체 검증률, 전체/진행/검수/막힘 작업 수, 보고 상태를 표시한다. 아래 GPT/Codex와 Claude의 실제 작업자를 함께 보여 주고 제공자로 필터한다.
표: 작업 / 역할 / 제공자·모델 / 상태 / 검증률 / 마지막 보고 / 막힌 이유.
행 상세: 완료 항목과 가중치, workerPct와 verifiedPct, 근거(안전한 커밋/검사 결과), 상위 Boss·작업 연결, 시도 이력. 실제 새 업무가 없으면 업무 없음 상태를 보여 준다. 여섯 역할이 상시 실행 중인 것처럼 만들지 않는다.
기존 최근 관측 기록은 아래 별도 영역에 유지한다. 공개 비로그인 화면에 Boss 목표/작업명이 나오지 않는다. 모바일에서는 행을 카드로 바꾸고 긴 문장이 잘리지 않게 한다. 접근성/라이트·다크는 현재 구조를 따른다.

## 장부 · 전송 · 접근
PGX 비공개 런타임의 단일 장부를 진행 상태의 권위 기준으로 두고 Windows 비공개 런타임은 Boss 보고 전송 outbox를 담당한다. 작업자 보고와 Boss의 수신확인/최종승인은 검증된 고정 helper를 통해 장부에 기록한다. 여러 장부를 서로 덮어쓰는 양방향 동기화는 만들지 않는다. Windows가 PGX의 승인된 보고만 기존 SSH 경로로 가져와 로컬 Codex queue로 전달하며 PGX에서 Windows 원격 제어 포트를 열지 않는다. 웹은 실행 권한을 갖지 않는다. 새 공개 명령 API나 app-server 포트를 만들지 않는다. 기존 토큰 보호 상태 경로에 엄격한 progress 읽기 뷰를 추가하는 방식을 우선 검토해 새 관리자 Funnel 명령을 피한다. 현재 metadata SnapshotV1과는 별도 ProgressV1로 검증해 기존 조회를 깨지 않는다. 구체적인 query/메서드는 구현자가 현 어댑터/Funnel 통과 검사를 통해 결정한다.
Windows 프로그램과 자식 SSH/SCP/Codex 프로세스는 CREATE_NO_WINDOW로 실행한다. 원본 대화, 키, 경로, tool 출력은 서버/표/보고에 노출하지 않는다. progress 필드는 허용된 요약/ID/상태/근거만 전달한다.
표 보고는 (bossId, runId, reportId, revision)을 고정하고 로컬 outbox에서 보낸다. 전송 상태는 pending → sending → queued → acknowledged이며 명확한 전송 실패는 retry_wait/failed, 결과를 확정할 수 없는 전송 중단은 uncertain으로 남긴다. queue 성공은 queued일 뿐 Boss가 받은 상태가 아니다. Boss가 보고의 고정 키를 읽고 helper로 수신확인을 기록해야 acknowledged다. 최종 결과 승인은 수신확인과 별도 기록이다. 종료된/오프라인 Boss에서 실제 소비 여부가 확인되지 않으면 queued/pending을 유지하고 received/done으로 꾸미지 않는다. 설치 버전의 queue 도움말에는 전송 멱등 키가 없으므로 망 단절 뒤 정확히 한 번 전송을 보장한다고 주장하지 않는다. 확정된 queued에는 무조건 재전송하지 않고, 명확한 실패만 제한된 횟수/백오프로 재시도한다. uncertain은 복구 시 장부/ack로 먼저 조정한다. Boss는 같은 보고 키를 다시 받으면 기존 ack를 재사용하고 사용자 표와 후속 작업을 중복 생성하지 않는다. 보고 envelope는 결과 통지로만 처리하며 신규 사용자 명령으로 재해석하지 않는다. 자동 전달과 중복 억제가 설치 버전에서 입증되지 않으면 완료를 주장하지 않고 해당 수용검사를 해결한다.


### 최소 장부 계약
- Run: runId, bossId, ownerId, projectId, objectiveSummary, planVersion, state, createdAt. bossId는 원래 부모 환경의 CODEX_THREAD_ID로 바인딩하고 자식의 환경 ID로 덮어쓰지 않는다. 실제 검증 대상 Boss UUID는 비공개 런타임 증거에만 기록하며 공개 문서나 재사용 도구에는 하드코딩하지 않는다.
- Task/Attempt: taskId, runId, role, provider, requestedModel, observedModel, attemptId, providerSessionId, parentTaskId, planVersion, state. 시도별 이벤트 순번과 단일 writer/lease로 오래된 시도 및 역순 이벤트가 현재 상태를 되돌리지 못하게 한다.
- Checkpoint: checkpointId, taskId, planVersion, weight, acceptanceCriteria, reporterId, verifierId, reportedAt, acceptedAt, evidenceRef. 작업자 권한은 자기 시도 보고로 한정하고 검증/최종승인 권한을 갖지 않는다. 근거는 해당 작업·계획 버전·실제 결과물 revision에 연결한다.
- Report/Ack: reportId, runId, bossId, revision, payloadHash, status, attempts, lastErrorCode, acknowledgedAt. 동일 키의 다른 payload는 충돌 처리한다. payload와 프로세스 인자는 shell 문자열로 이어붙이지 않고 검증된 고정 실행파일에 인자 배열로 전달한다.
ProgressV1은 이 장부의 허용 필드만 투영한다. 세션 UUID의 원본 매핑/런타임 경로는 비공개 런타임에만 두고 웹에는 필요한 불투명 ID만 제공한다. 브라우저가 체크포인트 승인이나 Boss ack를 쓸 수 있는 API는 제공하지 않는다.

### Builder check 반영: 구체적 실행 결정
설계 작성은 Atlas(Codex Sol medium)가 맡고 독립 Claude builder check의 질문을 아래처럼 정리했다. 추가 사용자 선택은 없으며 구현 시 입증할 검사가 남는다.
1. Boss ack/최종 승인: 새 재사용 `aski-boss` Codex skill의 보고 수신 절차가 고정 helper의 `ack(reportId, revision, payloadHash)`를 호출한다. 승인 여부는 별도 `accept-final` 호출로 기록한다. 모델 답변 문구나 transcript 감시를 승인으로 취급하지 않는다. 수신 ack는 승인 자체가 아니다. 이 skill/helper는 설계 승인 후 설치하고 문서화한다.
2. Boss ID: 현재 부모 Codex에 노출되는 CODEX_THREAD_ID를 최초 run 생성 때 기록한다. 현재 환경에서 이 변수를 읽어 존재/UUID를 확인했다. 자식에게는 고정된 원래 bossId를 전달한다. ID가 없으면 명시적인 선택으로 묶기 전 발주하지 않는다.
3. 실행 머신: Boss와 Codex native 자식은 기존 Codex 앱이 관리한다. Claude 실행 감독은 PGX의 작업별 비공개 supervisor가 실제 Claude CLI를 실행한다. PGX 장부가 단일 원본이다. Windows의 기존 pythonw 백그라운드 루프에 보고 전송 outbox 처리를 추가해 기존 로컬 Codex queue를 실행한다. 새 웹 Boss daemon을 만들지 않는다. 오래 실행되는 Claude 작업도 supervisor가 종료코드/이벤트를 수집한다.
4. queue 실패: 실제 현재 Boss로의 수신·ack 시험을 첫 구현 검증으로 앞당긴다. 명시적 실패는 제한 재시도, 결과 불명확은 uncertain으로 남긴다. 임의 새 app-server/원격 포트를 열거나 조용히 수동 보고로 바꾸지 않는다. 원인과 설치 버전별 해결책을 확인하고, 추가 권한이 실제로 필요한 경우 구체적 조치를 사용자에게 제시한다. 자동 보고가 입증되기 전 릴리스를 완료로 표시하지 않는다. 오프라인에서는 복귀 후 소비까지 pending/queued로 남는 것을 정상 복구 동작으로 본다.
5. 보고 권한: 같은 개인 OS 계정 안의 애플리케이션 권한 분리다. Boss가 발급한 attempt 범위 보고 capability와 검사자 capability, Boss capability를 별도로 검증하며 임의 role 문자열을 신뢰하지 않는다. worker는 자기 항목 reported만 쓰고 Sentinel은 배정된 항목 accepted만 쓰며 Boss-final은 Boss만 쓴다. private capability는 웹/로그/프로세스 인자에 싣지 않는다. 이를 별도 OS 사용자/VM 격리라고 표현하지 않는다.
6. 웹 전달: PGX 장부의 허용 필드를 현재 PGX 상태 어댑터의 read-only progress 뷰로 제공하고 Vercel owner API가 읽는다. Windows가 장부 원본을 새로 업로드하지 않는다. 기존 source 관측 수집과 독립된 장부다. 같은 기존 HTTPS 경로의 정확한 허용 query 등으로 확장하고 경로·query·메서드 허용 목록과 기존 V1 회귀 검사를 수행한다.
7. 가중치 확정: 사용자 목표/승인된 범위 안에서 Atlas가 제안하고 Boss가 실행 전 확정해 planVersion을 고정한다. routine 분해마다 사람에게 재승인을 묻지 않는다. 원래 사용자 범위를 실질적으로 바꾸는 요청만 사람에게 확인하고 그 이후 버전을 올린다. 문서화된 분모 변경 이력을 표시한다.
8. Claude 계정/동시성: 현재 PGX에 로그인된 개인 Claude CLI를 사용하며 새 키/구독을 만들지 않는다. 초기 Claude 동시 실행 상한2, 전체 작업자 상한4를 구현 기본값으로 두고 프로젝트/계정 오류 시 큐에서 대기한다. 실제 Claude 인증/모델 사용 가능 여부를 발주 전 확인한다. 승인된 작업 공간과 필요한 도구만 작업별로 허용하며 광범위 권한 우회 플래그를 쓰지 않는다. 추가 승인이 필요한 도구는 blocked로 Boss에 보고한다. 디자인은 소스 SVG/CSS/명세까지만 Claude가 담당하고 필요한 래스터 작업은 이미지 도구에 맡긴다.

## 수용 검사
- 실제 Codex 작업자 한 명과 실제 Claude 작업자 한 명이 서로 다른 최소 업무를 수행한다. provider/model/session/task 상관관계와 원래 Boss 수신을 확인한다.
- 각 작업의 최소2개 실제 완료 항목으로 worker report → Sentinel 검증 → 웹 검증률 변경을 확인한다. token/시간으로 진행률이 변하지 않는다.
- 실제 실패/막힘, 재시도, 중복 이벤트, 오래된 attempt, 범위 변경, 취소를 검사한다. 잘못된 상태를 done으로 바꾸지 않는다.
- 원래 Boss에서 reportId를 읽고 ack가 장부에 기록되며 사용자 표/후속 작업이 중복 생성되지 않는다. active/idle/offline에서 큐잉과 수신 차이를 검증한다. 임의 대화로 전송하지 않는다.
- 실제 로그인, 비소유자/비로그인 차단, logout 후 비공개 장부 제거, 오래된 응답의 재노출 차단을 검사한다. 기존 metadata 조회/collector 복구가 유지된다.
- 운영 PC/375px 화면, provider 필터, 상세/포커스/키보드, 링크/긴 이름/진행률 접근성을 확인한다.
- 앱/상태 프로세스가 재시작돼도 장부/전송 대기가 복원되고 CMD 창이 나타나지 않는다.

## 구현자가 정할 사항과 제약
장부의 SQLite 또는 원자 JSON 이벤트 저장, helper의 인자 구조, 리포트 카드 세부 간격은 구현 판단이다. 자기보고와 검증 권한, 멱등 키, 원래 Boss UUID, 허용 경로/근거 검증은 필수다. 현재 다른 작업자의 미커밋 인증 파일을 건드리지 않는다. 설계 승인 후 별도 격리 작업 공간에서 구현 계획을 작성한다. 기존 Vercel 두 사이트 중 이번 제품 변경은 Agent Office 중심이고 ASKI World 링크는 유지한다.

공식 참고: https://learn.chatgpt.com/docs/developer-commands#codex-queue ; https://learn.chatgpt.com/docs/agent-configuration/subagents ; https://learn.chatgpt.com/docs/app-server . 설치 CLI 도움말은 queue --thread SESSION_UUID --message TEXT를 지원한다. Claude 정찰 답변의 ‘기존 세션 push 경로 없음’ 주장은 이 공식 queue 확인으로 정정한다.

## 승인 후 확인된 프로젝트 목록 보완
GitHub 연결 조회에서 엔진 저장소 세 개가 private임을 확인했다. 기존 /api/projects는 의도적으로 공개 저장소만 제공하므로 그 경로를 private 조회로 바꾸지 않는다. owner 전용 런타임 프로젝트 catalog를 별도로 추가하고 실제 이름/비공개 GitHub 링크는 저장소 밖의 root 관리 설정에만 넣는다. 공개 소스/config/fixture에는 실제 private 프로젝트 이름/링크를 남기지 않는다. 로그인 owner의 선택기에는 아직 에이전트/작업 기록이 없는 catalog 프로젝트도 보이고 작업 없음으로 표시한다. 공개 GitHub evidence와 private catalog는 명시적으로 구분한다. 새 OAuth repo scope/키는 요구하지 않는다.
실제 실행 동시 한도는 전체 작업자 4개, 그중 Claude 2개이며 Boss는 한도 계산에서 제외한다. 구현은 한 번에 한 코드 구현자씩 직렬 진행하고 독립 검토 후 다음 작업으로 간다.


사용자 추가 표시 지시: 모든 화면·Boss 보고·자동 표에 Atlas(설계), Forge(개발), Frame(UI/UX), Palette(디자인), Scout(조사), Sentinel(검수), Boss(총괄)로 표시한다. 내부 roleId와 실제 provider/model/session identity는 변경하지 않는다.
