# Agent Office 중앙 캐릭터 라운지 · 검증률 차트 설계 추가안

상태: 웹 명령 설계와 함께 사용자 검토할 설계 추가안. 설계 문서만 작성·검토하며 제품 코드·설치·운영 활성화는 하지 않는다. Frame(UI/UX)의 별도 idle/work/blocked HTML은 명시적인 시각 preview이며 운영 데이터/실제 업무 검증이 아니다.

## 사용자 의도와 통합 범위
사용자는 프로젝트 중앙에서 여섯 역할 캐릭터가 일이 없을 때 쉬거나 놀고, 실제 일이 들어오면 열심히 일하면서 머리 위에 퍼센트와 땀이 보이길 원한다. 검증된 퍼센트는 Highcharts 같은 명확한 차트로도 보고 싶어 한다. 기존 웹 명령 → 동일 Codex Boss → 실제 GPT·Claude 분담 → 웹 검증률 → 원래 Boss 보고 흐름에 장면을 추가한다. 라운지가 실제 작업자를 생성하거나 업무를 진행시키지는 않는다.
기존 승인 `2026-10-29-boss-progress-design.md`, 대기 중인 `2026-10-29-boss-web-command-design.md`와 함께 읽는다. 이 추가안은 core Task6 UI의 확장이고 명령 composer/receipt와 같은 페이지에 통합한다. 기존 장부·실제 제공자·퍼센트·명령 인증/수신/재개 의미를 바꾸지 않는다. 웹 명령 및 이 추가안의 결합 설계가 승인되기 전 실제 scene을 구현하지 않는다. 기존 이미 승인된 core 작업과 재개 예약은 유지한다.

## 접근과 시각 정체성
기존 `app/components/role-avatar.tsx`의 여섯 SVG robot을 canonical identity로 재사용한다. Atlas의 깃발, Forge의 띠, Frame의 번개, Palette의 모자, Scout의 돋보기, Sentinel의 방패와 현재 역할색을 유지한다. 새 얼굴/동물 캐릭터를 임의 생성해 같은 역할처럼 바꾸지 않는다. 확대된 머리와 간단한 몸·손/팔·소품으로 lounge/work 포즈를 확장하고 CSS/SVG transform/opacity로 움직인다.
A. 기존 SVG robot + CSS/SVG 애니메이션 + semantic DOM 상태/차트. 현재 기술·정체성과 맞고 화면/접근성 검사가 단순하다. 이 설계의 제안이다.
B. 새 sprite/무거운 canvas scene. 별도 자산·렌더루프·텍스트 대체·해상도 처리가 필요하므로 이번 요구를 위해 도입하지 않는다.
C. 기존 목록에 숫자만 추가. 사용자 요청의 중앙 공간/행동 표현을 충족하지 않는다.
Palette(디자인)는 향후 실제 Claude 협업으로 장면 미감·포즈·색/소품을 다듬는다. 지금 쿼터 대기 중인 Claude 작업을 완료했다고 꾸미거나 GPT 작업을 Claude 디자인으로 표시하지 않는다. Frame의 현재 preview는 화면 검토용 제안이며 사용자 선택으로 확정된 완성 자산이 아니다.

## 화면 배치
owner 로그인 뒤의 읽기 순서는 다음과 같다.
1. 상단 👑🙂 Boss(총괄) 카드: 현재 연결 대상, 자유문장 명령 입력, 오른쪽 사각형 보내기, 최근 수신/답변/확인 질문 요약.
2. 프로젝트/provider 필터. 명령의 기본 현재 Boss context와 장면의 전체/프로젝트 필터는 다른 상태다. 필터를 바꿨다는 이유로 미전송 명령 대상이 조용히 바뀌지 않는다.
3. 메인 중앙 “에이전트 라운지”: 여섯 robot, 휴식 코너/작업 책상, 실제 업무 요약 차트, 모션 일시정지 버튼.
4. 기존 실제 task/agent 목록·검증 근거·source 관측 영역. 장면에서 선택한 task가 해당 상세/목록 항목과 연결된다.
Boss 입력은 라운지보다 앞/상단에 있고 프로젝트 필터 바로 아래 라운지를 배치한다. 기존 목록을 제거하지 않는다. 비로그인 화면에는 장면의 개인 프로젝트/작업/퍼센트를 노출하지 않는다.
PC는 라운지 캐릭터와 책상/휴식 소품을 한 중앙 공간으로 구성한다. 여섯 머리는 소품보다 충분히 크고 쉽게 구분되며 사람이 사용하는 책상·의자와 팔/몸의 크기 관계가 자연스럽다. 375px에서는 장면을 축소해 글자를 읽을 수 없게 만들지 않고 공유된 하나의 방 안에서 책상/휴식 구역을2열/3행 또는 세로 구획으로 재배치한다. 여섯 개 독립 카드로 방을 대체하지 않는다. 공통 바닥·벽·동선과 가구로 같은 공간임을 유지한다. 클릭 대상은 최소44px, 역할명/퍼센트/상태가 겹치지 않고 가로스크롤을 강요하지 않는다.

## 장식과 실제 실행의 구분
여섯 자리는 상시 역할 mascot이다. 휴식 애니메이션은 “역할 캐릭터”를 표현하며 여섯 실제 worker session이 실행 중이라는 뜻이 아니다. 장면 설명에 “업무 없는 역할은 휴식 캐릭터로 표시돼요. 실제 실행은 확인된 업무로 표시합니다.”를 둔다. 실제 업무가 없는 각 자리에 “휴식 · 배정된 업무 없음”을 표시한다.
일하는 연출은 등록되고 현재 유효한 ProgressV1 task/attempt에만 연결한다. SnapshotV1의 과거 task_started/working 관측, 공개 issue label, 마지막 API fetch 성공만으로 타이핑·땀·현재 업무 퍼센트를 만들지 않는다. 실제 작업자 수는 현재 유효한 attempt identity의 수로 계산하며 mascot 수6과 다르다.
ProgressV1.task는 projectId가 없으므로 task.runId→정확한 run.id→run.projectId로 연결한다. run이 없거나 planVersion 불일치, unknown role/provider 충돌이면 그 task를 해당 역할의 실시간 업무로 쓰지 않는다. 원본 task의 실제 provider/model을 표시하고 역할 기본 제공자로 실제 실행을 추측하지 않는다. provider가 고정 역할 배정과 충돌하면 “배정 확인 필요”로 표시하며 정상 근무처럼 연출하지 않는다.
현재 ProgressV1의 observedAt/task.state와 attempt.endedAt=null만으로 OS 프로세스/네이티브 자식의 생존을 증명할 수 없다. root 설계 결정은 optional typed `activityProofs`를 ProgressV1에 추가하고 새 parser가 기존 필드 집합 또는 기존+activityProofs만 허용하도록 strict exact-key 검사를 함께 확장하는 것이다. 기존 export에 필드가 없어도 읽히지만 근무 모션은 unknown/static이다. 새 필드를 보내기 전에 API/클라이언트 parser를 먼저 배포해 구버전 strict parser가 새 payload를 받지 않도록 단계적으로 켠다.
`ActivityProof={id:string,taskId:string,runId:string,attemptId:string,planVersion:number,provider:"codex"|"claude",source:"codex-native"|"claude-supervisor",state:"running"|"reviewing"|"stopped"|"unknown",confirmedAt:string,leaseExpiresAt:string}`이며 배열 최대2000·ID 중복 금지·기존1MiB 제한을 적용한다. 원본 PID/sessionUUID/path/토큰/본문은 투영하지 않는다. 해당 task/run/current plan과 유효 attempt가 정확히 일치해야 하고 provider/source도 일치해야 한다.
Claude proof는 supervisor가 실제 현재 child의 생존/작업 상태를 확인했을 때만, Codex proof는 네이티브 child의 실제 running 상태 확인이 있을 때만 갱신한다. exporter polling이나 기존 DB working 값을 다시 저장하는 행위로 confirmedAt을 새로 만들지 않는다. 브라우저·animation·자기보고 요약은 proof writer가 아니다. 레코드는 confirmedAt≤현재+5초, 현재-confirmedAt≤90초, 현재<leaseExpiresAt≤confirmedAt+90초를 모두 만족해야 한다. 중단/종료 확인은 즉시 stopped이고 작업 모션을 끈다. proof 갱신이90초 넘게 안 되면 live 실행을 추정하지 않는다.
유효 task가 있지만 proof가 없거나 만료/잘못된 상관관계이면 static “실행 확인 대기”로 표시한다. task/run 자체가 없을 때만 idle mascot이다. 검증률 근거는 별도이며 live가 불명이어도 마지막 검증률은 “마지막 확인”으로 표시할 수 있다. API fetch 성공/새 observedAt만으로 땀·타이핑을 시작하지 않는다.

## 상태 → 동작의 권위 규칙
| 상태/근거 | 동작 | 머리 위 표시 |
| --- | --- | --- |
| 현재 filter에 유효 task 없음 | 앉아 쉬기, 가벼운 놀이/손짓 | 휴식 · 업무 없음; 숫자 없음 |
| queued | 책상 곁에서 대기, 과한 동작 없음 | 대기 · 실제 검증률 또는 기준 없음 |
| working + 일치하는 유효 running activityProof | 키보드 두드리기/소품 작업, 작은 땀방울 | 검증된 완료율 N% + 현재 업무명 |
| qa + 유효 reviewing activityProof | 체크리스트/돋보기 검토, 느린 고개 움직임 | 검수 중 · 검증된 완료율 N% |
| blocked/failed | 동작 줄이고 휴식/문제 확인 포즈, 경고 텍스트 | 막힘/실패 · 유지된 검증률 · 이유 요약 |
| canceled | 작업 소품을 내려놓고 휴식 | 취소됨; 실제 기록만 상세에 유지 |
| done으로 실제 전이 | 최초1회 최대2초 작은 축하 후 휴식 | 검증된 실제 수치, 최근 완료 배지 |
| stale/연결 불명/activityProof 없음·만료/유효 lease 확인 불가 | 작업/땀/축하 모션 정지, 연결 표식 | 마지막 확인 시각 · 연결 확인 필요 |
땀은 working의 분위기 연출이며 부하/토큰/실제 속도를 측정한 지표가 아니다. qa/blocked/실패/대기에서 과도하게 일하는 땀을 보여 주지 않는다. 오류색만으로 상태를 전달하지 않는다. stale은 우선 적용하고 마지막 유효 데이터는 “마지막 확인”으로 남기되 현재 실행처럼 움직이지 않는다.
progress observedAt이90초 이상 오래됐거나 fetch 실패/계약 오류/로그아웃이면 stale 판단을 적용한다. 최근 fetch 성공이 오래된 observedAt을 새로 만들지 않는다. Task updatedAt은 업무 변경시각이며 heartbeat로 추정하지 않는다. 모션이 멈췄다고 서버 작업을 pause하지 않고, 작업이 차단됐다고 역할 캐릭터를 제거하지 않는다.

## 퍼센트와 차트
머리 위 숫자와 차트의 기본 값은 모두 verifiedPct다. workerPct는 기존 상세의 명시된 자기보고 숫자일 뿐 머리 위나 검증 차트에 섞지 않는다. 시간/토큰/타이핑 횟수/움직임/랜덤 값으로 숫자를 보간해 올리지 않는다. 승인 취소로 수치가 내려가면 실제 값과 사유를 반영한다.
현재 wire의 verifiedPct는 숫자 필수이지만 완료 기준/checkpoint가 없을 때 UI 파생값은 null로 두고 “— / 기준 없음”을 보여 준다. 계약에 null을 무단으로 넣거나 기준 없음=0%로 표시하지 않는다. 유효한 승인 기준이 있고 값0인 경우에만0%다. 실제 역할/모델이 확인되지 않은 task를 다른 robot의 숫자로 합치지 않는다.
Highcharts 같은 읽기 좋은 축·라벨·툴팁·활성 색 강조를 참고한 가벼운 SVG/DOM 막대 차트를 기본 제안으로 한다. 실제 Highcharts 의존성/라이선스 도입 요청으로 해석하지 않는다. 전체 업무는 선택된 run의 장부상 verifiedPct를 그대로 표시하고 역할별 가중치 없는 평균을 만들지 않는다. task 비교는 실제 task별 검증률 bar와 같은 값의 텍스트를 함께 제공한다. 차트 데이터가 없으면 빈 차트 대신 “검증할 업무가 아직 없어요”를 보여 준다. 다른 프로젝트 run을 임의로 하나의 전체 숫자로 합치지 않는다.
툴팁은 hover와 키보드 focus 모두 지원하며 중요한 값은 툴팁 밖에도 표시한다. CSS 장식 애니메이션이 차트 데이터나 checkpoint를 변경하지 않는다. 사용자 검토용 demo 퍼센트는 명시된 preview 모드/별도 HTML에서만 쓰며 실제 owner 장면의 API fallback이나 운영 fixture로 사용하지 않는다.

## 같은 역할의 여러 task·attempt와 필터
role별 mascot은 하나이고 task마다 worker를 중복 그리지 않는다. 후보는 현 filter에 속한 유효 task만이다. 하나의 task에 여러 attempt가 있으면 현 planVersion의 유효한 최신 active attempt만 사용하고 이전/취소/retry identity를 현재 업무 수에 중복 계산하지 않는다. 서버의 attempt 상관관계·승인 근거를 따른다.
같은 역할에 task가 여러 개면 기본 선택은 working→qa→blocked/failed→queued→done/canceled 우선순위와 task.id 사전순의 안정된 순서다. 각 상태 안에서는 새 polling마다 임의 최신 업무로 점프하지 않는다. 사용자가 고른 task는 후보로 남아 있는 동안 유지한다. “업무 N개” 버튼으로 실제 task 목록을 열어 선택하며 현재 머리 위 숫자가 어느 task인지 이름과 provider/model로 명시한다. 여러 task 숫자를 임의 평균하지 않는다.
선택 키는 project/run/task/role/attempt 식별자를 결합하고 DOM SVG의 gradient/clipPath id는 React useId 또는 인스턴스 namespace로 만든다. task ID가 다른 프로젝트/preview에 같아도 충돌하지 않는다. provider 필터로 task가 제외되면 그 task의 땀/숫자/상세를 숨기고 해당 mascot은 “현재 필터에 업무 없음”으로 표시한다. 필터 결과가 없다는 뜻을 실제 서버 전체 휴식으로 단정하지 않는다. 전체/프로젝트 전환 때 이전 프로젝트의 task selection을 잘못 유지하지 않는다.
done 축하는 taskId+attemptId+상태 전이로 현재 UI 세션에서 한 번만 재생하고 첫 로드의 과거 완료 기록/매 poll/필터 왕복은 반복 축하시키지 않는다. 새 유효 working task가 배정되면 축하보다 실제 업무 표시가 우선한다.

## 접근성·성능·보안
장면 전체를 장식 그림만으로 만들지 않는다. 각 역할은 semantic button 또는 접근 가능한 카드이며 역할명·휴식/업무 상태·task명·검증률·연결 상태의 텍스트 대체가 있다. 키보드로 상세를 열고 닫고 포커스를 되돌릴 수 있다. 장식 SVG와 땀은 aria-hidden이다. 실시간 수치 전체를 매번 aria-live로 읽지 않고 실제 상태 전환/막힘만 짧고 제한적으로 알린다.
prefers-reduced-motion에서는 이동·반복 타이핑·땀방울·축하를 정지 포즈로 바꾼다. 모든 사용자에게 보이는 “모션 일시정지/재개” 컨트롤도 제공하고 이 선택은 모션에만 적용한다. pause 중에도 데이터/텍스트/검증률은 갱신된다. 페이지가 보이지 않으면 반복 모션을 멈추고 복귀 시 최신 실제 상태를 다시 반영한다. 번쩍임·화면 흔들기·자동 카메라 이동을 사용하지 않는다.
고정된 여섯 SVG와 CSS transform/opacity 중심으로 구현하며 매 프레임 React state 갱신이나 heavy canvas loop를 추가하지 않는다. task 선택/상태/실제 데이터가 변할 때만 필요한 avatar/card를 다시 렌더한다. 프로필러로 동작 중 초당 React rerender를 만들지 않는지 확인하고3개 이상 avatar가 보이는 실제 화면에서도 반응성을 검사한다.
owner 인증·로그아웃·inflight generation guard는 기존 dashboard와 공유한다. logout/401/403이면 scene task/선택/차트/퍼센트/개인명령 상태를 즉시 비우고 오래된 응답을 무시한다. SVG 안에도 private raw session UUID/엔진 비공개 경로/원문 명령/secret을 넣지 않는다. 장면 클릭/animationend/차트 event는 UI 선택만 바꾸며 어떤 worker 발주·명령 POST·승인·완료 checkpoint도 호출하지 않는다.

## 구현 경계와 의존
예상 UI 경계는 `agent-lounge` 장면, 순수 task→role display-state selector, 기존 Avatar 확장 pose wrapper, 검증률 bar/텍스트, 역할 task picker다. 실제 파일/함수와 TDD 단위는 통합 승인 뒤 writing-plans에서 정한다. 기존 ProgressV1과 optional activityProofs의 strict contract가 권위이고 role/project/live 매핑을 먼저 테스트한다. 원래 필드만 있는 payload의 회귀와 새 필드의 잘못된 ID/시간/provider/source 조합을 검증한다. 기존 task 상세/목록과 동일 task를 선택하도록 연동해 별도 가짜 데이터 장부를 만들지 않는다.
의존은 core Task3 실제 장부/검증과 Task4 live provider/attempt 상태, Task5 보고/실행 identity, Task6 owner UI다. 웹 명령은 입력 origin이고 task 상태를 직접 변경하지 않는다. 명령은 서버 접수돼도 Task가 아직 없으면 장면은 대기/휴식이며 타이핑을 시작하지 않는다. 웹 조회/clarification은 새 worker가 아니므로 라운지 업무 수를 늘리지 않는다. core 완성 전 preview로 미감을 검토할 수 있으나 실제 근무/퍼센트가 동작한다고 릴리스하지 않는다.

## 수용 검사
1. TDD 순수 selector로 task 없는 idle, 유효 working/qa/blocked/failed/canceled/done, 기준 없음/null 표시, verifiedPct와 workerPct 다른 값, stale 우선순위, 필드 없는 구버전 payload의 static 실행 확인 대기, lease 근거 없음, observedAt만 새롭고 confirmedAt 오래된 경우, confirmedAt 미래/lease90초초과/provider-source 불일치, orphan run/plan mismatch/unknown role/provider 충돌을 검사한다. Snapshot working 하나만으로 땀/숫자가 생기지 않는다.
2. 같은 역할 multi-task/multi-attempt, retry·오래된 attempt·동일 id 충돌·안정 선택·필터 왕복·provider 제외·프로젝트 전환을 검사한다. 실제 선택된 task의 수치가 머리와 차트·상세에서 같다.
3. 실제 GPT와 실제 Claude의 등록 task가 들어와 working→검증→완료로 바뀌는 것을 owner 웹에서 확인한다. 체크포인트 없는 숫자, 가짜 demo fallback, animation에서 새 발주가 없어야 한다. report ACK와 Boss100% 의미도 기존 설계를 따른다.
4. done 축하 최초 전이1회/최대2초, reload/poll/과거 완료 첫 로드 반복 없음, 새로운 active 업무 우선, blocked/frantic sweat 없음, stale freeze/마지막 확인 label을 검사한다.
5. owner/nonowner/logged-out, logout 중 inflight 응답, 다른 프로젝트 task 누출, private identity/source text 누출을 검사한다. 기존 catalog/metadata/progress/command receipt 읽기와 입력 동작이 유지된다.
6. PC와375px에서 가구/캐릭터 크기·긴 이름·퍼센트·키보드·터치·포커스 복원·tooltip·텍스트 대체·aria-live를 확인한다. prefers-reduced-motion 및 visible pause 상태에서 서버 데이터 갱신은 계속돼야 한다.
7. 페이지 hidden/다시 visible, 네트워크 단절/오래된 observedAt/정상복구, 장면3개 이상 SVG 동시 모션에서 DOM 충돌·과도한 render/CPU 없이 동작하는지 검사한다. 필요 없는 heavy canvas/frame polling을 추가하지 않는다.

## 검토에서 확정할 제안과 builder check
root 설계 기본값: 중앙 위치/상단 Boss 입력, canonical 여섯 robot, CSS/SVG 애니메이션,375px 재배치,90초 stale,2초 한 번 축하, verifiedPct 머리 표시, 가벼운 bar chart다. 사용자 방향은 이미 명확하므로 별도 선택 질문을 늘리지 않고 결합 문서/preview로 검토받는다.
검수자는 activityProof의 confirmedAt이 실제 native child/supervisor 확인에서만 갱신되고 단순 fresh export로 위조되지 않는지, role/project/attempt 매핑에 누수가 없는지, 기준 없는 wire 숫자가 운영 UI에서 가짜0%가 되지 않는지, task 선택/필터와 done 전이 재생이 안정적인지, reduced motion/로그아웃 시 의미가 유지되는지 확인한다. 실제 Highcharts 제품 자체를 도입하려면 사용자가 요구하는 효과와 라이선스/기술 조건을 별도 확인하되 이번 요청에 무거운 라이브러리를 필수로 붙이지 않는다.

## 독립 검토와 시안 확인
Codex Sol 6.1 medium의 독립 builder check에서 구현 계획 전에 추가 답변이 필요한 중요한 질문은 없음을 확인했다. 실제 activityProof writer가 아직 없으면 static 실행 확인 대기를 유지하는 기본값을 재확인했다. Frame(Terra6.1)의 공유 라운지 동작 시안은 root가 HTTP 로컬 브라우저에서 PC/375px, 휴식/업무/막힘 전환, 움직임 줄이기를 확인했다. 시안의 예시68%/42%는 가상 미리보기이며 실제 구현/진행/수용검사 완료의 근거가 아니다. 웹 명령 설계와 함께 사용자 승인을 받은 뒤 통합 구현 계획과 실제 검증을 진행한다.
