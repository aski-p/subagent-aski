# 웹 명령 → 기존 Codex Boss 설계 확장

상태: 사용자 “추가 설계 승인” 완료. 웹 명령·검증률 차트·animated lounge의 구현, 실제 end-to-end 검증, 승인된 기존 경로 활성화와 Vercel 반영을 진행한다. 이 문서 갱신은 계획 작성이며 제품 코드는 아직 변경하지 않았다.

## 의도와 기존 작업과의 관계
사용자는 Agent Office 웹에서도 일을 지시하고, 현재 사용 중인 동일 Codex Boss가 실제 GPT·Claude 작업자에게 나누어 수행하며, 웹에서 검증된 진행률을 보고 원래 Boss에서 보고를 받길 원한다. 기존 Codex 직접 지시는 계속 가능하다. 새 웹 Boss나 대체 제공자를 만들지 않는다.
이 문서는 `2026-10-29-boss-progress-design.md`의 “웹은 읽기만 한다/웹 명령 제외”만 확장한다. 이미 승인된 역할, 장부, 체크포인트 검증, private 프로젝트 목록, 원래 Boss 보고와 승인 절차는 유지한다. 설계 Atlas(설계)는 Codex Sol 6.1 medium이며, Forge(개발)/Scout(조사)/Palette(디자인)는 실제 Claude, Frame(UI/UX)/Sentinel(검수)는 기존 Codex 지정 모델을 사용한다. 전체 작업자4/Claude2 상한과 제공자 대체 금지는 유지한다.
현재 원래 Boss queue probe는 실제 수신확인이 완료됐다. 이는 특정 시험 메시지의 전달 근거이고 아래 웹 사용자 인증·영수증·명령 중복 억제·실행 연동까지 검증된 것은 아니다. private 엔진 목록과 한글 역할 표시가 운영 중이며 나머지 기존 개발의 예약 재개를 취소하지 않는다. Claude 쿼터 대기는 대기 사유로 표시하고 GPT로 대체하지 않는다.

## 현재 코드에서 확인한 경계
- `scripts/agent-status/adapter.mjs`: 기존 동일 상태 URL의 GET 기본 뷰/`view=progress`만 허용하고 나머지 경로·메서드를 거부한다. 기존 bearer는 읽기 토큰이다.
- `lib/owner-auth.ts`: 서명된 Secure/HttpOnly/SameSite=Lax owner 세션, 허용 origin 확인, `getAuthenticatedSession`/`requireOwner`가 있다. 기존 로그아웃은 origin 확인 POST다.
- `app/api/office/progress/route.ts`: owner 확인 후 서버가 PGX에서 읽는다. 브라우저에 upstream bearer를 주지 않는다.
따라서 기존 read bearer에 쓰기권한을 붙이거나 현재 GET을 은근히 제어 API로 바꾸면 안 된다. 아래 쓰기 경로는 별도 owner 검증과 별도 command bearer를 갖는다.

## 접근법
A. 웹 owner POST → 기존 PGX 주소의 정확히 허용된 command 뷰 → 비공개 durable inbox → 기존 Windows 숨김 루프의 outbound SSH pull → 로컬 `codex queue` → 동일 Boss의 명시적 명령 수신 → 기존 분담. 기존 구조를 재사용하고 원래 Boss를 유지한다. 이 문서의 제안이다.
B. 웹에서 새 전용 Boss runner를 시작한다. 기존 Boss와 대화/승인 주체가 달라져 사용자 요구와 맞지 않는다.
C. 브라우저에서 데스크톱/app-server에 직접 연결한다. PC 포트·토큰을 브라우저에 노출하고 온라인 PC에 의존하므로 선택하지 않는다.
A는 새 Funnel 없이 기존 HTTPS mapping이 동일 경로의 query와 POST를 통과시키는지 검사한 뒤 사용한다. 통과하지 않으면 그 제한을 먼저 보고한다. 임의 새 포트·Funnel·원격제어 우회를 자동으로 열지 않는다. 이 접근법/문서에 대한 사용자 검토 후 구현 계획에 연결한다.

## 사용자 경험
owner 로그인 화면 최상단의 👑🙂 Boss(총괄) 카드에 서버 연결된 보낼 곳을 읽기 전용으로 표시하고 프로젝트 선택, 여러 줄 자유문장 입력과 오른쪽 사각형 “보내기” 버튼을 둔다. 명령마다 확인 모달을 추가하지 않는다. 새 업무뿐 아니라 “다들 뭐해” 조회와 기존 업무 수정 지시도 같은 Boss에게 보낸다. 전체 채팅 스트리밍/별도 독립 Boss는 범위 밖이며 수신 이력·핵심 진행률·보고 요약으로 확인한다. 원래 Boss 원본 UUID는 표시하거나 입력받지 않는다. 기본 context는 “현재 Boss 업무”이며 프로젝트 미선택(null)도 허용한다. 공백 명령/한도 초과는 전송 전에 설명한다. 보이는 프로젝트는 서버의 현재 owner catalog와 허용된 공개 프로젝트만이며 없는 엔진에 임의 작업을 발주하지 않는다.
전송 중 버튼을 비활성화하고 aria-busy/상태 영역으로 알린다. Enter는 줄바꿈, Ctrl+Enter 또는 Cmd+Enter는 명시적 전송이며 IME 조합 중에는 보내지 않는다. 중복 클릭/자동 재시도는 같은 clientRequestId를 사용한다. 명령을 바꿨다면 새 ID를 만든다. 실패하면 입력을 유지하고 같은 ID로 결과 조회/재시도할 수 있다. uncertain에서는 새 ID로 재전송 버튼을 제공하지 않고 기존 ID 상태 조회/같은 ID 재요청만 허용한다. 성공적으로 접수된 뒤에는 입력을 비우고 아래 영수증으로 상태를 보여 준다. query 답변과 확인 질문은 owner 전용 영수증 카드의 제한된 요약으로 표시하고 “이어 답변” 버튼으로 같은 Boss에게 보낸다. 전체 채팅 스트리밍은 만들지 않는다.
상태 문구는 “서버 접수”, “PC 연결 대기”, “Boss 전달 대기열”, “Boss 수신 확인”, “작업 시작”, “기한 만료”, “전달 확인 필요”, “전송 실패”를 구분한다. 접수 성공을 작업 시작/완료로 표현하지 않는다. 작업 시작 후 기존 task 표에 연결한다. 긴 명령은 owner 상세에서 접어서 보여 주고 목록은 제한된 요약만 사용한다.
역할은 얼굴 emoji와 한글 설명을 함께 표시한다: 👑🙂 Boss(총괄), 🤓 Atlas(설계), 👨‍💻 Forge(개발), 🧐 Frame(UI/UX), 👩‍🎨 Palette(디자인), 🕵️ Scout(조사), 👮 Sentinel(검수). emoji는 장식 aria-hidden이고 실제 역할명은 텍스트다. 화면 크기375px에서도 입력/버튼/상태/긴 텍스트가 잘리지 않고 키보드 포커스와 터치 동작을 유지한다.
로그아웃/401/403 시 명령 입력·내역·CSRF·프로젝트·진행률 메모리를 지우고 요청을 취소하며 generation guard로 오래된 응답의 재노출을 막는다. 서버에 이미 접수된 명령은 로그아웃으로 취소되지 않는다는 설명을 보낸 직후 영수증에 둔다. 명령 원문은 localStorage나 브라우저 URL에 저장하지 않는다.

## 명령 인증과 수신 계약
### 브라우저 → Vercel
`POST /api/office/commands`의 입력은 정확히 `{schemaVersion:1,clientRequestId:UUID,projectId:opaqueId|null,text:string,replyToCommandId?:UUID}`만 허용한다. BossUUID, targetURL, executable, shellCommand, provider, modelOverride, ownerId, role, status 같은 추가 필드는 거부한다. 자연어 명령은 사용자 요청 내용이며 실행파일/URL/모델 설정으로 직접 연결하지 않는다.
서버는 현재 유효한 owner 세션을 먼저 확인한다. request URL origin을 고정 허용목록으로 검사하고 Origin 헤더가 정확히 같아야 한다. 누락/다른 Origin, cross-site Sec-Fetch-Site는 거부한다. `Content-Type: application/json`과 `X-Office-CSRF`를 요구하고 cross-origin CORS를 열지 않는다. origin/Host 헤더를 upstream 목적지나 Boss 대상으로 쓰지 않는다.
`GET /api/office/commands`는 owner에게 최근 영수증(최대50, cursor pagination)과 CSRF context를 반환한다. CSRF는 서명된 짧은 수명 토큰으로 현재 세션 cookie의 서버측 digest에 결합하고 만료15분을 적용한다. cookie/서명 비밀 자체는 응답에 담지 않는다. POST 재인증 후에만 CSRF를 검증한다. CSRF endpoint는 private,no-store다.
요청 body는 스트리밍으로 최대16KiB까지 읽고 이후413, text는 trim 후1~4000 Unicode code points·NUL 거부·UTF-8 한도 검증을 적용한다. projectId가 있으면 서버 catalog에 실제 존재해야 한다. null은 일반 조회/현재 Boss context이며 임의 프로젝트 권한을 뜻하지 않는다. 구체 프로젝트 작업의 대상 정보가 부족하면 Boss가 질문하고 등록 프로젝트를 확정한 뒤 발주한다. 기본 null 허용은 일반 조회를 지원하기 위한 root의 설계 결정이다. replyToCommandId가 있으면 같은 owner·동일 binding의 실제 parent command여야 하며 awaiting_input인 부모에만 답변으로 연결한다. parent가 없거나 다른 owner/binding이면 정보 노출 없이 거부한다. 이미 답변된 query 카드의 추가 질문은 replyToCommandId를 붙이지 않은 일반 새 명령으로 현재 context에 보낸다. 이어 답변은 awaiting_input인 확인 질문에만 사용하고 임의 parent 변경은 허용하지 않는다. 이 필드는 새 사용자 답변을 연결하는 용도이며 기존 command의 원문/상태를 바꾸지 않는다. 요청 text는 JSON 문자열로만 처리하고 HTML은 escape해서 출력한다. 사용자 입력의 URL/명령 문자열은 의미상 작업 요청일 뿐 전송 레이어의 주소나 shell 인자가 아니다.
Vercel은 서버 전용 `OFFICE_COMMAND_WRITE_TOKEN`으로 PGX에 전달한다. 이 토큰은 기존 read bearer/JWT/OAuth 비밀과 달라야 한다. 새 OAuth scope/제공자 키/구독은 만들지 않는다. owner 인증은 GitHub owner 세션에서 확정하고, 서버가 확정한 actor와 clientRequestId를 PGX의 전용 command authority로 전달한다. 브라우저가 보낸 actor 문자열을 신뢰하지 않는다.

### Vercel → PGX
기존 설정된 상태 URL을 검증한 뒤 고정 `?view=commands` query로 만든다. 이 정확한 URL의 POST만 command bearer를 받는다. 기존 GET 기본/`view=progress`는 기존 read bearer만 받는다. read bearer로 POST는403, command bearer로 기존 read는403을 검사한다. unknown query, duplicate view, 다른 메서드/경로, redirect는 거부한다. 전용 command bearer는 서버-서버 명령 접수에만 사용하고 Windows/Boss capability로 재사용하지 않는다.
PGX는 body를 다시 엄격히 검사하고 owner actor를 고정 설정과 대조하며 null context 또는 지정된 private catalog/project 허용목록을 재확인한다. Vercel의 프로세스 메모리가 아닌 PGX SQLite transaction에서 owner 기준5개/분·30개/시간·미수신 활성명령 최대20개를 적용한다. 동일 멱등 요청 재조회는 새 명령량으로 세지 않는다. 초과는429+Retry-After, 다른 payload로 같은 ID는409다.
멱등 키는 `(ownerId, clientRequestId)`이고 canonical payloadHash는 projectId+정규화된 text+schemaVersion+replyToCommandId(null 포함)이다. 같은 키/해시는 원래 commandId 영수증을 반환한다. 다른 clientRequestId라도 같은 owner/binding/project/replyTo/canonical payloadHash의 미종결 기록이 있으면 PGX의 단일 DB transaction에서409 `equivalent_pending`과 기존 opaque receiptId만 반환한다. 원문을 추가 노출하거나 새 command/run을 만들지 않는다. 이는 uncertain의 새ID 우회를 UI 밖에서도 차단한다. handled/done 등 완료 처리 뒤 동일 문장 조회를 새 ID로 보낸 경우에는 새 의도로 허용한다. 같은 문장 자체를 영구 중복 금지하지 않는다. 접수 transaction이 commit된 경우에만202 또는 재조회200을 반환한다. 네트워크가 끊겨 응답이 없으면 브라우저는 새 ID를 만들지 않고 같은 ID로 조회/재전송한다. Vercel의 timeout/502는 실패 확정이 아니라 “접수 확인 중”으로 표시한다.
명령 store는 비공개 runtime 디렉터리0700/파일0600이며 원문은 사용자 명령에 한해 저장한다. 이것은 기존 transcript 금지의 좁은 확장이다. raw session/tool 로그·credentials를 수집하지 않는다. 원문/engine identity/토큰은 공개 소스/config/fixture/로그/비로그인 응답에 넣지 않는다. 영수증 목록은 제한된 요약이며 원문은 owner가 보낸 현재 메모리 상세와 Boss의 private redeem 경로에만 제공한다.

## durable 상태와 동일 Boss 연결
원본 Command는 commandId/clientRequestId/ownerId/projectId(null 허용)/text/payloadHash/replyToCommandId(null 허용)/createdAt/expiresAt/bindingRevision/state/processingStage/lastHandledAt?/classification?/targetRunId?/queueAttemptId/queueMessageId?/receivedAt?/runId?/errorCode를 갖는다. processingStage는 not_received/received/classified/dispatch_intent/dispatched/handled로 구분하며 state와 함께 transaction으로 저장한다. replyKind는 query_answer/clarification/ack 또는 null, replySummary는 최대2000 Unicode code points, replyUpdatedAt은 서버 시각이다. reply 필드는 Boss 전용 helper만 쓰고 브라우저 입력에는 허용하지 않는다. 원래 Boss UUID와 runtime 경로는 별도 비공개 binding에 있고 웹 영수증에는 opaque destination label만 투영한다.
Binding은 운영자가 원래 부모의 검증된 환경으로 등록한 owner→정확한 Boss UUID→Windows bridge identity이다. 브라우저/child env/최신 활성 대화/이름 유사도로 선택하지 않는다. binding 없음·비활성·revision 불일치는 접수를503 `boss_unavailable`로 차단한다. binding 교체는 미수신 명령을 새 Boss로 자동 이전하지 않는다.
기본 상태는 accepted → claimed → queued → received → started이며 query의 handled, clarification의 awaiting_input, 미답변 종료의 closed를 추가한다. definite transport failure는 retry_wait/failed, send 결과 불명확은 uncertain, 미수신24시간은 expired다. TTL은 접수 시 고정하고 Boss가 실제 redeem할 때도 확인한다. 이미 received/started/awaiting_input인 명령은24시간 TTL로 취소하지 않는다. 명령 자체와 run 진행률 상태는 별개다. received는 Boss가 인증된 원본을 확인한 상태이고 시작을 약속하는 말이나 결과 승인은 아니다.
Windows 기존 hidden loop가 outbound SSH의 고정 helper `command-claim`으로 lease+fencing token을 받아 가져온다. payload의 executable/SSH destination을 실행하지 않는다. 로컬 `codex queue`는 고정 실행파일과 argument array로 원래 binding UUID만 대상으로 실행한다. Python 프로그램뿐 아니라 SSH/SCP/Codex 자식도 CREATE_NO_WINDOW를 적용한다. PC 종료/절전/인터넷 단절은 pending 상태로 지속하고 다른 머신/채팅으로 우회하지 않는다.
브리지는 보내기 전에 durable attempt를 저장한다. queue 성공은 queued로만 기록한다. definite failure는 최초1회 +5초 뒤1회 +30초 뒤1회, 최대3회 TOTAL attempt로 제한한다. 120초는 terminal 실패 알림 cooldown이며 네 번째 전송 시간이 아니다. 보내기 후 상태 저장 전 프로세스가 죽었거나 timeout이면 uncertain으로 보존하고 무조건 새 queue 호출을 하지 않는다. uncertain은 기존 command-redeem 상태/queue 영수증 증거로 조정한다. received가 확인되면 기존 수신 ACK를 재사용하고, 확정 미전달 실패만 제한 재시도한다. 미수신 명령은 TTL24시간이 지나 PGX transaction에서 expired로 확정된 뒤에만 새 명령 재전송을 허용한다. 늦게 도착한 이전 envelope는 redeem에서 거부하므로 이미 expired 명령이 뒤늦게 실행되지 않는다. lease가 만료돼도 send 가능성이 있던 attempt는 단순 재발주하지 않는다. 원래 queue에는 exactly-once 멱등 옵션이 입증되지 않았으므로 전송 정확히 한 번을 주장하지 않는다.

## 명령 envelope와 보고 envelope 분리
메시지 유형은 `office.user-command.v1`과 기존 `office.result-report.v1`을 구분한다. 사용자 명령 envelope에는 commandId/payloadHash/bindingRevision/서버에서 확정된 actor label와 사용자 text를 담고, 보고는 reportId/runId/revision과 결과 요약을 담는다. command envelope를 result ack 경로로 처리하거나 report text를 새 작업 지시로 실행하지 않는다.
표식 문자열 자체는 인증 수단이 아니다. Boss의 설치된 skill은 commandId를 보고 private helper `command-redeem`을 호출해 원본 actor/payloadHash/binding/유효기간을 확인한 뒤 명시적 command receipt를 transaction으로 기록한다. 비공개 Boss capability가 필요하며 브라우저/worker가 대신 호출할 수 없다. 동일 commandId를 다시 받아도 기존 receipt/run 연결을 재사용한다. 검증에 실패한 envelope는 새 사용자 권한을 얻지 못한다.
Boss가 원문을 확인해 실제 현재 사용자 지시로 처리하되, 사용자 프로젝트/작업 권한 범위와 기존 위험 작업 승인 조건은 유지한다. 웹 명령은 광범위 secret 접근/병합/배포/외부 메시지의 포괄 승인으로 간주하지 않는다. 정상 개발 업무를 세부 단계마다 재승인받게 만들지도 않는다.
Boss의 controller는 redeem 후 명령을 query / new_task / revise_run / needs_clarification 중 하나로 분류하고 classification과 targetRunId/revision을 장부에 한 번 기록한다. 현재 active turn에 도착했다는 이유만으로 진행 중 작업을 덮어쓰는 steering으로 처리하지 않는다. “다들 뭐해” 같은 query는 현재 관측·검증 상태로 답하고 새 run/가중치/작업자를 만들지 않는다. new_task는 commandId→runId를 transaction으로 한 번만 결합하고 실제 시작 때 started로 바꾼다. revise_run은 같은 owner/project의 명확히 지정된 기존 run에만 instruction revision으로 연결하고 안전 체크포인트에서 적용하며 기존 범위/결과를 조용히 덮어쓰지 않는다. 대상이 여러 개거나 원래 요청을 대체·취소하는지가 불명확하면 needs_clarification으로 Boss가 사용자에게 내용 질문을 하고 실제 수정 발주는 보류한다. 무조건 latest run을 선택하지 않는다. 같은 프로젝트 수정 작업과 충돌하면 앞 작업의 안전 체크포인트 뒤 대기시키며 자동으로 내용을 합치지 않는다. 추가 명령은 별도 명령으로 보존한다. query는 Boss helper가 query_answer 요약을 저장한 뒤 received→handled/runId=null로 종료하므로 started/runId를 의무로 만들지 않는다. needs_clarification은 clarification 요약을 저장하고 awaiting_input으로 전환한다. 사용자는 카드의 “이어 답변”으로 새 명령을 보내며 replyToCommandId가 원래 질문과 연결된다. Boss가 이 답변의 인증된 원문을 확인한 뒤 동일 기존 run/명령 맥락을 이어가고 질문 자체를 새 업무로 중복 발주하지 않는다. 명령 하나가 만들 수 있는 새 run은 최대1개이고 revise_run은 기존 run을 참조한다. revise_run의 범위·계획 버전·지시 변경 이력을 명시적으로 저장한다. 기존 native GPT+실제 Claude 분담/검증률/최종표 보고를 그대로 사용한다. Claude 쿼터·도구 승인 대기는 blocked/waiting 사유로 보고하며 제공자를 바꾸지 않는다.

### 수신 후 중단과 재개
Boss skill은 매 turn/resume 시작에 private `command-resume` helper로 해당 binding의 received이지만 분류/dispatch 미완료인 명령과 processingStage/lastHandledAt을 확인한다. 새 queue 도착이 없어도 기존10분 Boss heartbeat 또는 재시작 후 정상 turn이 이미 수신된 승인 업무의 복구 계기가 된다. report polling 자체는 새 명령이나 worker 발주 권한을 만들지 않는다.
classification, command→run binding, dispatch intent는 발주 전에 transaction으로 기록한다. 재개 시 동일 command/run/attempt를 재사용한다. helper/skill이 spawn 직전 또는 직후 중단돼 이미 spawn됐을 가능성이 있으면 해당 attempt를 uncertain으로 보존하고 native child identity/Claude supervisor evidence와 조정한다. 명확한 미발주 증거 없이 새 worker를 무조건 만들지 않는다. dispatch 완료/handled 기록은 실제 결과와 연결하고 중복 resume은 상태를 재사용한다. received만 남은 명령이 영구 방치되거나 중복 발주되지 않는 것이 수용 기준이다.

## 읽기 API와 명령 내역
브라우저 GET `/api/office/commands`는 owner 인증 후 서버가 동일 고정 upstream command 뷰의 GET을 읽기 bearer로 요청한다. 이 GET은 sanitized command receipts만 반환하고 원문/secret/bindingUUID를 반환하지 않는다. 기존 기본/progress GET의 schema와 method/auth 동작은 변하지 않는다. 첫 구현은 제출한 원문을 메모리에 유지한 현재 영수증 상세와 요약 내역만 제공한다. 새 원문 상세조회 API는 만들지 않는다. 원문은 ProgressV1/metadata에 넣지 않는다. command receipt 전용 owner API는 Boss가 쓴 replyKind/replySummary/replyToCommandId/awaiting_input을 반환하며 이 제한된 답변으로 웹만 사용하는 사용자도 조회 답과 확인 질문을 읽고 이어 답변할 수 있다.
명령 receipt에는 id/projectId(null 허용)/summary/state/processingStage/lastHandledAt?/createdAt/updatedAt/expiresAt/runId?/replyKind?/replySummary?/replyToCommandId(null 허용)/replyUpdatedAt?/safeErrorCode가 있고 Windows 연결 마지막 관측시각은 별도다. 연결 최근 시각만으로 Boss 수신을 추론하지 않는다. 목록/진행률의 캐시는 logout 시 비우고 서버 응답은 모두 private,no-store다. 취소/수정/자동재발주 버튼은 이번 범위에 넣지 않는다. 실패는 미전달 확정일 때만 기존 ID의 제한 재시도를 허용하고 uncertain에서는 새 ID를 금지한다. TTL 후 expired transaction이 확정된 명령은 사용자가 새 명령으로 다시 요청할 수 있으며 새 ID임을 명확히 표시한다. 이미 처리된 ID는 재실행하지 않는다.

### 보존·정리 정책
다음 수치는 root의 설계 기본값이다. 명령의 terminal 상태는 handled/failed/expired/closed이며 started는 연결 run이 끝나 결과 ack가 기록된 뒤 handled로 전환한다. terminal 명령의 raw text와 reply 본문은 terminalAt부터7일 뒤 purge하고 owner 표시용 receipt 요약은30일 뒤 purge한다. private DB의 compact 멱등 tombstone(ownerId/clientRequestId/payloadHash/commandId/terminalState)은 지속 보존한다. purge된 clientRequestId 재조회/재전송은410 `already_processed`를 반환하고 새 명령으로 재실행하지 않는다. 같은 ID의 해시 충돌은409다. 개인정보를 포함할 수 있는 원문/답변을 tombstone이나 일반 로그에 복사하지 않는다.
active/awaiting_input의 원문은 적법한 expire 또는 terminal까지 보존한다. 미답변 clarification은 질문 마지막 갱신부터30일 후 closed로 전환하고 새 요청이 필요함을 owner에게 표시한다. 이 정리는 연결된 기존 core 작업을 자동 취소하지 않는다. 이미 received/started인 작업을24시간 전송 TTL로 expire시키지 않는다. 정리 transaction과 재시도/조회가 경합해도 tombstone이 남아 중복 실행을 막아야 한다.

## 구현 연결점과 활성화 범위
기존 Task1/3–6 장부·supervisor·보고 bridge·Boss skill이 이 확장의 의존성이다. 이번 확장은 별도 후속 계획으로 작성하며 이미 완료된 catalog/role 작업을 다시 구현하지 않는다. 예상 변경은 새 command contract/owner API, adapter의 정확한 command view 분기, command inbox 장부, bridge의 command channel, Boss skill의 redeem 처리, 웹 composer/receipt UI, 해당 인증·상태·브라우저 검증이다. 기존 report channel은 독립 키/유형/중복 장부를 유지한다.
개발/격리테스트/preview 검증과 운영 활성화를 구분한다. 운영 기본값 `OFFICE_WEB_COMMANDS_ENABLED=false`; Vercel UI/API와 PGX POST가 모두 off에서503으로 닫히고 read GET은 정상이다. 배포만으로 명령 쓰기를 켜지 않는다.
이번에는 설계 문서에 대한 사용자 검토를 먼저 받으며 구현은 그 승인 뒤 진행한다. 기존 사용자 배포/Vercel 반영 허가는 유지하고 이 문서만으로 새 승인 절차를 만들지 않는다. 이번 설계 승인 요청은 코드 작성·검증·기존 HTTPS 경로의 제한된 command POST 활성화·Windows 소비 연동·운영 Vercel 반영까지 구체적 범위를 함께 제시한다. 승인 뒤에는 기존 허가 범위의 운영 반영까지 계속 진행하며 별도의 activation 승인 질문을 반복하지 않는다. 최종 활성화의 구체적 범위는 정확한 기존 HTTPS command view의 POST 허용, 별도 command token의 서버 두 곳 설정, Windows 기존 loop의 command 소비 활성화, 고정 Boss binding 확인, canonical 웹 기능 플래그 on이다. 이 변경은 구현과 양단 검증이 끝난 뒤 실제 대상/검증 결과를 확인하고 마지막에 활성화한다. 실제 자동 승인 검토 또는 도구가 추가 승인을 요구하거나 기존 사용자 승인 밖의 구체적 조치가 새로 필요할 때만 그 이유와 정확한 조치를 설명하고 요청한다. 제품 권한 확장이라는 이유만으로 별도 자동 인프라 승인 게이트나 매명령 확인창을 추가하지 않는다.
토큰 값은 로그나 채팅에 표시하지 않고 안전한 런타임 설정만 사용한다. 가능하면 기존 HTTPS mapping을 유지한다. 새 Funnel/path mapping이 실제로 필요하다고 판명되면 필요한 정확한 변경만 밝히며 별도 자동 인프라 변경을 가정하지 않는다. 롤백은 write/UI feature flag off와 consumer claim 중지이며 이미 received/started인 작업의 결과/장부를 지우지 않는다.

## 수용 검사
1. 실제 owner 웹 명령→durable accepted→동일 Windows local queue→원래 Boss의 redeem/receipt→실제 run 시작→GPT+Claude 분담→검증률 변경→원래 Boss 결과표 ack와 최종100%를 연결한다. queue probe 성공으로 이 검사를 대신하지 않는다.
2. 비로그인/다른 owner/만료세션/Origin 누락·위조/CSRF 누락·다른세션/비JSON/16KiB 초과/unknown fields/미등록 프로젝트/임의 Boss·URL·shell·모델 필드는 차단하고 upstream을 호출하지 않는다. command/read bearer 상호 오용은403이다.
3. 중복 클릭, browser timeout 뒤 같은ID 재시도, 같은ID 다른payload409, 다중 Vercel 인스턴스, PGX restart와 SQLite 동시 claim을 검사한다. 단일 command→최대1개 새 run이며 query는 handled/runId=null, revise_run은 기존 run+변경 이력이다. duplicate envelope는 재발주하지 않는다.
4. PC 오프라인/절전/queue timeout/queue 성공 후 bridge 죽음/PGX 상태 저장 실패/lease 만료/24시간 만료/지연 도착/잘못된 binding/순서 뒤집힘/active Boss의 query·new_task·revise_run 분류를 검사한다. 불확실한 상태를 received로 만들지 않고 expired envelope는 실행하지 않는다.
5. received 직후/분류 저장 후/dispatch intent 저장 후/spawn 직후 중단과 heartbeat·restart resume을 검사한다. 동일 command/run/attempt를 재사용하고 spawn 가능성이 있으면 uncertain 조정 없이 재발주하지 않는다. query 답변/clarification이 웹에 보이고 이어 답변의 parent 인증·해시·동일 맥락 복구가 검증된다. 브라우저의 reply/state 위조는 거부한다.
6. terminal7일/30일 purge, active 보존, clarification30일 closed, 지속 tombstone과410/409, GC 동시 재요청을 검사하며 core 작업은 취소되지 않는다. 새ID로 동등한 미종결 payload를 동시에 제출하면 단일 transaction의 equivalent_pending409+기존opaque receiptId만 반환하고 원문/command/run이 추가되지 않는다. 완료 뒤 동일 질의의 새 요청은 허용한다. answered query의 추가 질문은 일반 새 명령이고 awaiting_input 아닌 parent의 replyTo는 거부한다.
7. 기본 snapshot/progress/catalog GET 회귀, readtoken 무쓰기, logout 중 응답 재노출 없음, 명령원문·private identity·token 공개 누출 없음, 실패 응답에 원문/스택 없음, 실제 hidden child window 없음.
8. PC/375px에서 프로젝트·얼굴emoji·한글역할·텍스트입력·IME·Ctrl/Cmd+Enter·버튼비활성·aria-live·긴명령·실패복구를 확인한다. 명령 접수/수신/시작/완료 상태가 사용자에게 구별된다.
9. preview에서만 먼저 쓰기 검증하고 off 플래그가 양단에서 막는지 확인한 후, 승인된 정확한 운영 활성화 범위에서 동일 owner flow를 다시 확인한다. 미검증 운영 기능을 완료로 주장하지 않는다.

## 구현자가 확정할 세부와 builder check
16KiB/4000자, rate5/분·30/시간, pending20, TTL24시간, polling15초, 기존 loop 재사용과 신규취소 UI 제외는 이 설계의 제안값이다. 문서 승인 시 기본값으로 확정한다. 실제 CLI 경로·Boss UUID·엔진 목록·키·비공개 runtime 경로는 운영 설정으로만 주입한다.
기술 확인은 구현 전 read-only 현황조사와 격리검증으로 해결한다: 기존 HTTPS mapping이 정확한 query의 POST를 전달하는지, 앱 queue 소비시점의 active/idle/offline 차이, 기존 exporter loop에 command/report 채널을 안전히 독립 삽입할 수 있는지, 기존 Boss skill의 capability와 redeem contract를 어디서 결합할지다. 어느 것도 새 사용자 기능 선택을 추정해야 하는 질문은 아니다.
검수자에게 전달할 질문:
- read bearer가 새 쓰기에 사용되는 길 또는 브라우저가 Boss/actor/project 권한을 위조하는 길이 남았는가?
- queue 응답이 사라진 경우와 지연된 중복 메시지에서 단일 command→단일 run을 실제로 보장할 수 있는 redeem transaction/상태가 충분한가?
- 명령 envelope 인증과 결과보고 ack가 서로 섞이거나 unsigned 표식이 사용자 권한을 얻는 경로가 있는가?
- received 뒤 중단/resume, 웹 확인 질문의 이어 답변, uncertain 새ID 금지와 tombstone410이 충분히 명시되고 중복 발주를 막는가?
- TTL·오프라인·busy Boss·Claude 쿼터 대기·로그아웃이 기존 승인된 작업을 취소하거나 새 제공자로 대체하는가?
- 기존 GET 회귀 없이 현 HTTPS mapping/프로세스에서 실행 가능한가? 활성화 변경 목록 중 아직 기술적으로 확인되지 않은 항목은 무엇인가?

공식 queue 참고: https://learn.chatgpt.com/docs/developer-commands#codex-queue . 실제 지원과 별개로 웹 명령 전체 수신·실행 수용검사는 위 기준으로 다시 수행한다.

## 독립 builder check 결과
Codex Sol 6.1 medium의 독립 검토에서 수신 뒤 복구, 웹 확인 질문/답변 연결, uncertain 전송 해소, 기록 정리와 멱등성 보존의 네 질문을 확인했다. root가 정한 기본값과 transaction/resume 계약을 문서에 반영했고 재검토에서 네 질문 모두 해소, 계획 전에 추가 답변이 필요한 중요한 질문/새 중대 결함 없음으로 확인했다. 실제 queue·resume·spawn 동작은 구현 수용검사에서 입증한다. 이 문서 승인은 명시된 구현·검증·기존 경로의 command 활성화·운영 Vercel 반영 범위를 함께 승인하는 것으로 제시한다.

승인 후 구현 계획: `../plans/2026-10-29-boss-web-commands.md`, `../plans/2026-10-29-boss-agent-lounge.md`. 실제 Claude 작업 예약/제공자 대체 금지와 단일 코드 구현자 검토 순서를 유지한다.
