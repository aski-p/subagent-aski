# Boss Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Existing Codex Boss assigns real GPT/Claude work, exposes verified progress to its owner on Agent Office, and receives a durable report acknowledged in that same chat.

**Architecture:** A PGX SQLite ledger owns registered runs, attempts, checkpoints, catalog, and report revisions. Codex native children and supervised Claude CLI children report through a private helper; the existing authenticated status endpoint adds typed read views. A hidden Windows bridge pulls pending reports through existing SSH, calls local `codex queue` for the bound Boss UUID, and records explicit Boss acknowledgements separately from queue acceptance.

**Tech Stack:** Existing Next.js/React/TypeScript, Node >=22.13, Python standard library sqlite3/unittest/subprocess, installed Codex/Claude CLIs, existing SSH/SCP; no new hosted runner, OAuth scopes, keys, or database service.

**Spec:** `docs/superpowers/specs/2026-10-29-boss-progress-design.md`

## Global Constraints

- User choice: “Codex 대화창에서 지시·보고, 웹에서 진행률 확인”. Web remains read-only.
- Roles: Codex Atlas `gpt-6.1-sol` medium, Frame `gpt-6.1-terra`, Sentinel `gpt-6.1-sol`; actual Claude Forge/Scout/Palette. Resolve availability honestly; no silent substitution.
- Maximum active workers 4, including at most 2 Claude; Boss excluded. One code implementer at a time, fresh review gate before next task.
- Runtime/config/spool live outside source; directories 0700, private files 0600. Actual private engine names/links never enter public source/config/fixtures.
- Keep original `subagent-aski` authentication changes untouched. Work only in `subagent-boss`, branch `feat/boss-progress-20261029`, base `52db81b`.
- Exact original parent UUID binding; never pick latest/name match or copy a child CODEX_THREAD_ID. No new app-server/Funnel administration or public command API.
- Source text, transcripts, credentials, raw tool output and private filesystem paths never enter status/report projections. Hidden Windows child processes use CREATE_NO_WINDOW.
- Legacy simulation is not evidence. 100% includes a positive-weight final Boss-approval checkpoint. Queue success is not receipt or approval.

## Review Focus

1. CLI accepts a queue request but desktop does not consume it: retain queued/uncertain, require actual Boss ack (Tasks 1/5).
2. No live agent exists for a private engine: owner selector still lists catalog project with empty tasks; no public evidence request for it (Tasks 2/6).
3. Worker retries after changed scope: old attempt/plan evidence cannot advance current revision (Task 3).
4. User logs out while a progress response is in flight: cancel/generation-gate and erase all private catalog/progress state (Task 6).
5. Program dies after queue send before saving state: preserve uncertainty and suppress repeated user reports via report-key ack, never claim exactly-once transport (Tasks 1/5).

---

## File boundaries and execution order

Tasks 1→2→3→4→5→6 are serial implementation/review gates. Task 2 may proceed while the already queued Task 1 probe awaits a natural parent-turn boundary; this does not pass the transport gate. Task 1 proves transport before complex runtime. Task 2 fixes engine visibility early. Runtime Python belongs under `scripts/agent-office/`; shared public read contracts under `lib/`; web UI under `app/components/`. Existing metadata collector stays observation-only.

### Task 1: Prove queue delivery to the actual desktop Boss

**Files:** Create `scripts/agent-office/queue_bridge.py`, `scripts/agent-office/queue_bridge_test.py`, `docs/agent-office-acceptance.md` (sanitized evidence template only).

**Interfaces:** Produce `queue_report(codex_exe: str, boss_id: str, report: dict, run_process=...) -> dict` returning `{status: queued|retry_wait|uncertain, reportId, revision, errorCode}`. `render_report_envelope(report: dict) -> str` requires bossId/runId/reportId/revision, bounded summary/table, and explicit result-not-new-command marker. Bridge CLI `python queue_bridge.py probe --boss-id UUID --report-id ID --codex-exe PATH` sends only the designated probe. No background job is installed here.

- [ ] Write failing tests `test_uuid_only_target`, `test_queue_acceptance_not_ack`, `test_timeout_uncertain`, `test_argument_array_and_hidden_windows_child`: reject names/invalid UUIDs, assert no shell=True, Windows creation flag, report key retained; successful subprocess returns queued and never acknowledged.
- [ ] Run `python3 -m unittest discover -s scripts/agent-office -p queue_bridge_test.py -v`; expect missing module/function failures.
- [ ] Implement the interface using a fixed executable and argument array, timeout, bounded safe message, generic errors. On Windows use installed `C:/Users/aski/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe`; the absolute path is runtime configuration, not a guessed PATH executable.
- [ ] Rerun tests; all pass. Reuse root’s already submitted hidden probe identified only in the private runtime evidence `queue-probe.json`; do not commit real Boss/queue/probe identities. It exited 0 but has not yet been consumed in the active parent turn; keep queued, not passed. After a natural parent-turn boundary, root must confirm receipt. Do not send a duplicate probe solely because the current turn is active. Any necessary replacement probe targets only the root UUID from original Windows CODEX_THREAD_ID (child environment is not authority). Root must actually read its reportId here and acknowledge it. Save sanitized success/failure evidence outside source; commit only the reusable template. Check that no visible CMD window opens.
- [ ] Gate: if the intended desktop chat does not receive the queued probe, diagnose and resolve transport before Task 3/4/5 runtime work; help text alone does not pass. Never send probes to other chats.
- [ ] Review and commit exact files: `git add scripts/agent-office/queue_bridge.py scripts/agent-office/queue_bridge_test.py docs/agent-office-acceptance.md && git commit -m "feat: verify bound Boss queue transport"`.

### Task 2: Owner-only runtime project catalog and early engine selector fix

**Files:** Create `lib/progress-contract.ts`, `lib/progress-client.ts`, `app/api/office/progress/route.ts`, `tests/progress-contract.test.ts`, `tests/progress-auth.test.ts`; modify `scripts/agent-status/adapter.mjs`, `app/components/office-dashboard.tsx`, `lib/office-browser.ts`, `tests/office-dashboard.test.tsx`, `scripts/agent-status/README.md`.

**Interfaces:** `PrivateProject={id:string,label:string,repositoryUrl:string|null,visibility:"private"}`; `ProgressV1={schemaVersion:1,observedAt:string,catalogState:"available"|"unavailable"|"stale",projects:PrivateProject[],runs:RunProgress[],tasks:TaskProgress[],reports:ReportView[]}`. Export `WorkState="queued"|"working"|"qa"|"done"|"blocked"|"failed"|"canceled"`; `RunProgress={id:string,bossId:string,bossLabel:string|null,projectId:string,objectiveSummary:string,planVersion:number,state:WorkState,verifiedPct:number,workerPct:number,updatedAt:string}`; `TaskProgress={id:string,runId:string,parentTaskId:string|null,role:string,provider:"codex"|"claude",requestedModel:string|null,observedModel:string|null,state:WorkState,planVersion:number,verifiedPct:number,workerPct:number,blockerSummary:string|null,updatedAt:string,checkpoints:CheckpointView[],attempts:AttemptView[]}`; `CheckpointView={id:string,label:string,weight:number,bossOnly:boolean,state:"pending"|"reported"|"accepted"|"revoked",evidence:EvidenceView[]}`; `EvidenceView={id:string,kind:"commit"|"verification"|"link",label:string,safeUrl:string|null,verifiedAt:string|null}`; `AttemptView={id:string,state:WorkState,observedModel:string|null,startedAt:string,endedAt:string|null}`; `ReportView={id:string,runId:string,revision:number,status:"pending"|"sending"|"queued"|"acknowledged"|"retry_wait"|"failed"|"uncertain",updatedAt:string}`. All identity fields in this view are opaque projections; default arrays empty, no inference from metadata. Export `parseProgress(value:unknown, nowMs?:number):ProgressV1`, `readAdapterProgress():Promise<ProgressV1>`, `fetchOfficeProgress(signal?:AbortSignal):Promise<ProgressV1>`. Adapter `createServer` gains optional `progressPath,catalogPath`; authenticated GET `/agent-office-status?view=progress` reads a validated progress spool plus private catalog. Other query values/duplicates and non-GET fail closed. Existing bare URL still returns unchanged SnapshotV1. Server config `STATUS_ADAPTER_URL` stays the exact bare URL; readAdapterProgress builds only the fixed `view=progress` query after validating that base. Catalog file default `/home/aski/agent-office-status/projects.json`, content `{schemaVersion:1,projects:[...]}`; no actual names in committed examples.

- [ ] Write failing parser/adapter/auth tests: private catalog project with zero records remains listed; duplicate IDs/unsafe GitHub URL/userinfo/unknown fields rejected; missing catalog is empty; malformed catalog yields catalogState unavailable with no prior cache, or stale with last validated catalog, never silently hides previously loaded projects. Unauthenticated/nonowner requests cannot reach upstream. Use synthetic placeholder IDs only.
- [ ] Run `npx tsx --test tests/progress-contract.test.ts tests/progress-auth.test.ts tests/office-dashboard.test.tsx`; expect absent contract/route/view failures.
- [ ] Implement strict 1 MiB bounded views with exact schema/field limits and `private,no-store`. Keep GET `/api/projects` public-only and unchanged. Add private catalog options independently of snapshot agents. Selecting private IDs shows safe empty tasks and must not call `/api/projects/<private>/runs`. Preserve public evidence separately.
- [ ] Rerun tests plus `npx tsx --test tests/status-contract.test.ts tests/status-auth.test.ts`; all pass. Root alone populates actual three engine records in private runtime config during authorized installation, never in this commit.
- [ ] Review and commit the exact files listed in this task with message `feat: expose owner runtime project catalog`.

### Task 3: Durable checkpoint ledger and trustworthy percentages

**Files:** Create `scripts/agent-office/ledger.py`, `scripts/agent-office/office_cli.py`, `scripts/agent-office/ledger_test.py`; extend `lib/progress-contract.ts`, `tests/progress-contract.test.ts` only if needed to match frozen Task 2 types.

**Interfaces:** `Ledger(db_path: str, capability_file: str)` binds an issued local actor capability (worker task/attempt, verifier assignment, or bound Boss); role strings in events confer no authority. Bootstrap/issuance writes only protected runtime capability files, stores credential hashes, and never prints capability values or projects them. This is application authorization within the trusted local OS owner, not OS isolation. Use this bound context for every mutator. Methods: `create_run(run:dict,tasks:list,checkpoints:list)->dict`, `start_attempt(task_id:str,attempt:dict)->dict`, `report_checkpoint(event:dict)->dict`, `verify_checkpoint(event:dict)->dict`, `ack_report(boss_id:str,report_id:str,revision:int)->dict`, `approve_run(boss_id:str,run_id:str,plan_version:int)->dict`, `project_progress(now_iso:str)->dict`, `enqueue_report(report:dict)->dict`. CLI exposes `run-create`, `attempt-start`, `checkpoint-report`, `checkpoint-verify`, `report-ack`, `run-approve`, `export`, all JSON input via stdin or protected file; stdout is bounded safe JSON. Reporter commands cannot call verifier/Boss operations through worker dispatch. CLI authorization validates the issued capability scope; worker capability cannot invoke verifier or Boss operations. This is not cryptographic isolation from malicious same-UID processes.

- [ ] Write failing SQLite tests: weights 30/50/20 (last checkpoint Boss-only), worker report alone verifiedPct=0, accepted first checkpoint=30, all non-Boss checkpoints=80, correct Boss approval=100. Cover duplicate event idempotency, same key different payload conflict, old attempt/plan rejection, revoked evidence decrease, blocked state retaining accepted weights, restart persistence, report ack differing from approval, transactional admission limit 4 total/2 Claude, and rejection of forged role strings/wrong-task/wrong-attempt/worker capability for verifier and Boss calls.
- [ ] Run `python3 -m unittest discover -s scripts/agent-office -p ledger_test.py -v`; expect missing implementation failures.
- [ ] Implement standard-library sqlite3 transactions, unique keys and append-only evidence/revision audit, sanitized export through atomic temp+rename. Persist explicit observed provider IDs; optional requested model is not proof of actual model. Serialize all mutating CLI calls. Export only current-version valid evidence; pending/failed/canceled distinct from accepted. Add private catalog projection only through Task 2 adapter, not worker input.
- [ ] Rerun Python tests and TS contract tests; all pass. Inspect exported JSON using synthetic sentinel transcript/path/secret values: none survive. Require finite positive total weights and a positive Boss-only final checkpoint.
- [ ] Review and commit exact task files with message `feat: persist verified Boss progress ledger`.

### Task 4: Real Claude supervisor and native Codex reporting contract

**Files:** Create `scripts/agent-office/claude_worker.py`, `scripts/agent-office/claude_worker_test.py`, `scripts/agent-office/role-policy.json`, `docs/agent-office-workers.md`.

**Interfaces:** `launch_claude(job:dict, ledger:Ledger, run_process=...) -> dict` accepts registered runId/taskId/attemptId/planVersion, role in Forge/Scout/Palette, approved worktree, bounded prompt and model request. Returns observed providerSessionId/model and terminal status; consumes Ledger interfaces from Task 3. CLI `claude_worker.py --job PROTECTED_FILE --db PRIVATE_DB` supervises one child and reserves/releases a transactional ledger slot. Native Codex children use the root's collaboration tools; root binds returned child identity through `attempt-start`. Role-policy contains public role/provider/model defaults only; no engine identities or tokens.

- [ ] Write failing tests for Claude stream init/session capture, structured result missing/error despite exit=0, invalid/mismatched session, interruption/nonzero exit, spawn failure slot release, 4-total/2-Claude limit, role rejection, worktree allowlist, child stdin/args secrecy and safe state summaries. Assert Claude roles cannot be satisfied by invoking Codex.
- [ ] Run `python3 -m unittest discover -s scripts/agent-office -p claude_worker_test.py -v`; expect missing supervisor failures.
- [ ] Implement supervised installed Claude CLI with supported flags verified by its installed help, newline JSON output, bounded reads/timeouts, no provider fallback, deliberate tool/worktree limits, signal interruption and exact child-result correlation. Never treat a process exit as checkpoint acceptance. Use existing approved login without reading/copying credentials. On Windows launched subprocesses also use CREATE_NO_WINDOW.
- [ ] Rerun tests. Perform one actual small read-only Claude task and one native Codex task in isolated approved directories; register both identities and report a real artifact/check. Keep real prompts/results private. Verify parent/attempt correlation and observed models, not role labels alone.
- [ ] Review and commit exact task files with message `feat: supervise actual Claude Office workers`.

### Task 5: Persistent report outbox, Windows bridge, and reusable Boss invocation

**Files:** Extend `scripts/agent-office/queue_bridge.py`, `scripts/agent-office/queue_bridge_test.py`, `scripts/agent-office/ledger.py`, `scripts/agent-office/ledger_test.py`, `scripts/agent-office/office_cli.py`; create `scripts/agent-office/export_progress.py`, `scripts/agent-office/install-windows.ps1`, `scripts/agent-office/install-pgx.sh`, `skills/agent-office-boss/SKILL.md`, `docs/agent-office-runtime.md`.

**Interfaces:** `bridge_once(config:dict)->dict` pulls only sanitized pending reports over the existing allowlisted SSH destination, persists local SQLite outbox before calling Task 1 queue_report, and records transport state back through fixed office_cli operations. Report states pending/sending/queued/acknowledged/retry_wait/failed/uncertain match the spec. `export_progress.py --db PRIVATE_DB --output PRIVATE_SPOOL --once|--loop` publishes ProgressV1. Existing status adapter reads this spool using Task 2 view. The skill documents root binding once, roles/caps, native child registration, Claude supervisor invocation, reporting, Sentinel verify, and report-ack/run-approve; it must not impersonate user approval or delegate without the user's instruction.

- [ ] Write failing outbox/recovery tests: restart at sending becomes uncertain; definite rejection retries at most 3 total queue invocations: initial attempt, retry after 5 seconds, final retry after 30 seconds; 120 seconds is a terminal-failure notification cooldown, never a fourth attempt; queued does not resend merely due missing ack; duplicate report key is harmless and altered payload conflicts; ack from wrong Boss fails; repeated ack has no new report/job. Test fixed SSH command/path arguments and no visible Windows child console using real-child Windows acceptance in addition to mocks.
- [ ] Run Python unittest discovery for all `*_test.py`; expect new outbox/recovery assertions to fail before implementation.
- [ ] Implement bridge loop with 15-second polling, bounded messages and generic error codes. Store root-managed runtime config outside repo; install scripts validate resolved paths and exact allowed hosts. Reuse existing status URL/Funnel mapping. The PGX installer provisions ledger/exporter only, never starts unrequested agent work. Windows task uses current-user logon, IgnoreNew, no execution-time limit, hidden interpreter and hidden child processes; no unsupported 15-second Scheduler repetition.
- [ ] Validate skill using skill-creator/writing-skills instructions before copying to user skills. Root installs private catalog/runtime configs and the reusable skill only after reviewing dry-run output; do not copy credentials or alter existing unrelated task definitions. Actual current authorization covers this feature setup.
- [ ] Rerun all Python tests. Perform process restart, active/idle/offline Boss, queue-uncertainty and duplicate-delivery acceptance; record reportId ack in ledger. Verify actual SSH/SCP/Codex child launches stay invisible and no new listening/Funnel port appears.
- [ ] Review and commit exact task files with message `feat: deliver durable progress reports to bound Boss`.

### Task 6: Complete owner progress UI and real end-to-end acceptance

**Files:** Create `app/components/boss-progress.tsx`, `app/components/task-progress-detail.tsx`, `tests/boss-progress.test.tsx`, `tests/boss-progress-browser.mjs`; modify `app/components/office-dashboard.tsx`, `app/globals.css`, `lib/office-browser.ts`, `tests/office-dashboard.test.tsx`, `docs/agent-office-acceptance.md`, `docs/agent-office-runtime.md`.

**Interfaces:** `BossProgress({progress:ProgressV1, selectedProject:string, stale:boolean})` renders goal, opaque Boss display identity, verified percentage, counts and queued/ack state. `TaskProgressDetail({task:TaskProgress})` renders weights, evidence, worker vs verified values, blocker and attempt history. No write controls or command entry. The dashboard owns auth/generation/AbortController and clears private state on logout/401/403.

- [ ] Write failing UI tests for independent catalog options, empty projects, actual GPT/Claude provider filter, no invented always-running roles, unknown historical percentages shown as “—/기준 없음”, queued vs acknowledged labels, long text, semantic progress labels, and stale response after logout. Browser test covers keyboard focus and 375px cards without clipped names; links never reveal runtime paths.
- [ ] Run `npx tsx --test tests/boss-progress.test.tsx tests/office-dashboard.test.tsx`; expect absent components/behavior failures.
- [ ] Implement components and integrate progress polling alongside unchanged metadata display. Normalize the common provider filter so progress codex matches metadata openai and progress claude matches metadata anthropic, with explicit unknown historical values retained. Maintain public/private evidence distinction from Task 2 and generation-safe state clearing. Show plan changes/revocations explicitly; verifiedPct is authoritative and workerPct only labeled detail.
- [ ] Run `npm run verify`; require lint/typecheck/tests/build all pass. Run existing `npm run test:office-browser` and `node tests/boss-progress-browser.mjs` against the intended local/preview URL. Inspect real desktop and 375px screenshots. Do not broaden repeated test loops without changes/failures.
- [ ] Root performs final real acceptance: original Boss creates a new run; actual native GPT + actual Claude complete distinct tasks with at least two genuine checkpoints each; Sentinel accepts evidence; owner web percentage changes; final report reaches original Boss and gets explicit report-ack; Boss run-approve makes final 100%. Verify one blocker/retry and restarted outbox, all three private runtime engine options with safe empty records where appropriate, unauthenticated/nonowner denial and logout clearing. No simulation or help-only evidence counts. Deployment/PR integration follows user-authorized release workflow; do not claim production until production checks pass.
- [ ] Self-review this task, inspect its diff for private engine names/URLs/secrets/runtime files, then commit exact task files; root owns the per-task reviewer and later independent whole-branch gate. Commit with message `feat: show verified Boss work and complete acceptance`.

## Plan self-review

Spec coverage: existing-chat ownership/queue=Tasks 1/5; real roles and caps=Tasks 3/4; verified checkpoint semantics=Task 3; private engine catalog=Task 2; owner UI/access/logout=Tasks 2/6; installation/hidden subprocess/restart=Task 5; final evidence chain=Task 6. All five Review Focus cases have explicit owning tests. Types originate in Task 2 and ledger exports must validate against that schema. Review gates and exact interfaces permit one implementer at a time; Claude implementers remain real Claude, not renamed GPT agents. No product implementation, installation, live queue probe, or background job has been executed by writing this plan.
