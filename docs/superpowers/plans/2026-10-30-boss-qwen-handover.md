# Actual Qwen role handover addendum (2026-10-30)

## Authority and status

This addendum overlays the approved core/web/lounge plans. The user's new instruction assigns actual Qwen independent sessions to Forge (development), Scout (research) and Palette (design), reporting into the SAME originally bound Codex Boss. Atlas, Frame and Sentinel remain actual Codex with their existing model assignments. This supersedes prospective Claude-only assignments, reserved-Claude waiting and no-provider-replacement wording for these three roles only. Completed Claude/Codex history is immutable; no old attempt, session, evidence or provider is relabeled.

Existing full-feature implementation/release approval remains in force. No repeated design approval is required. One code writer at a time and a fresh root-dispatched BASE..HEAD review remain required. Preserve accepted artwork and completed core1/2/3, W1-W4 and lounge1/4/5 behavior. Pending work remains actual provider supervision, result-specific core5, genuine lounge2 proofs, full core6/lounge3 charts and real end-to-end acceptance.

Inspected source base: 99be4c5. Existing untracked scripts/agent-office/__pycache__/ is unrelated and must remain untouched. This document records an implementation plan; it is not evidence of Qwen execution or a complete provider migration.

## Known implementation gaps

- Ledger.create_run and ProgressV1 accept only codex/claude. Native prepare explicitly rejects any non-Codex provider with supervisor_unavailable.
- Lounge contracts accept only codex-native/claude-supervisor and lounge-state hardcodes Forge/Scout/Palette to claude.
- Current installed Boss controller exposes command-native-* and command-result/command-result-ack, but no Qwen supervisor or generic result-report handler.
- queue_report exists, and the original exact-Boss transport probe was acknowledged. Reuse that evidence: do not send another probe just to repeat it.
- command-result registration already binds a command to the current plan and complete actual attempt map. Its ACK is not the final Boss-approval checkpoint.
- The command channel's local outbox is not the deferred result-report outbox. Do not reuse command claim leases or receipt ACKs as result delivery authority.
- Current projections emit role=worker rather than the intended specific role; the provider handover must persist real registered role identity so lounge joins do not rely on names or simulations.

## Decisions fixed by this addendum

Provider identity adds qwen; claude remains readable for history. New Forge/Scout/Palette tasks use qwen. ActivityProof adds only the correlated pair qwen/qwen-supervisor. Current role eligibility selects Qwen for those three roles; historical Claude tasks remain available in history/details but cannot masquerade as new Qwen role activity. Keep existing unknown/stale/attempt/plan checks.

Retain 4 active workers total. Replace the old prospective 2-Claude cap with a conservative shared external-worker cap of 2 across active claude+qwen attempts AND uncertain external reservations. Existing historical rows do not consume a slot; any genuinely open legacy attempt still does. Do not gain two extra slots by adding a provider. Qwen role sessions are independent and explicitly mapped per task/attempt; one role must not share or pick another role's session.

A backend-unavailable job stays queued with a bounded backend_unavailable blocker and zero current work proof. No attempt/session/model execution is fabricated. Preflight before a launch reservation where possible; after an actual uncertain launch, retain the reservation until authoritative reconciliation, not a timeout. If a child did launch and then errors, record that actual failed attempt and release only its known process slot. Never retry through Claude, Codex, a remote provider, or a stateless wrapper.

Runtime helper paths, model ID, backend URL, auth material, original Boss/session IDs and transcripts stay in protected configuration/evidence outside source. Use the known installed Qwen Code executable selected by the owner runtime, not PATH lookup or the obsolete system wrapper. Its inspected v0.26.3 help supports stdin prompt, stream-json, explicit session-id/resume, approval-mode, max-wall-time and max-tool-calls. Exact stream event validation must use installed package definitions plus a real sanitized fixture; Claude JSON shapes are not an API contract for Qwen.

Do not start services, free GPU memory, stop/unload other projects, change backend ports or rewrite global Qwen configuration. Existing backend unavailability limits live acceptance, not offline planning, synthetic tests, contract review or prepared dispatch briefs.

## Serial slices and exact ownership

### Q0 - Offline provider contract and dispatch brief (Atlas now)

Files: this addendum and one link overlay in the core plan. No product source, installation or configuration changes. Record code ownership, fixtures and acceptance below. Root may prepare protected Qwen job briefs and inspect already approved runtime metadata without issuing a real task.

This is the work Atlas can finish now. The user's reassignment does not silently authorize giving Forge's implementation to Codex. Root should keep Q1-Q3 assigned to actual Qwen Forge. If root chooses a separate Codex-owned reader compatibility integration, it must explicitly state that narrow ownership to the user before writing product code; do not describe it as Qwen work.

### Q1 - Provider contracts, historical compatibility and admission (actual Qwen Forge)

Modify only: scripts/agent-office/ledger.py, ledger_test.py, office_cli.py, commands.py, commands_test.py; lib/progress-contract.ts, lib/lounge-contract.ts, lib/lounge-state.ts; app/components/office-dashboard.tsx; tests/progress-contract.test.ts, lounge-contract.test.ts, lounge-state.test.ts, office-dashboard.test.tsx. Add scripts/agent-office/role-policy.json and docs/agent-office-workers.md.

Interfaces: central role/provider policy preserves six role IDs and artwork. Persist registered task role as a backward-compatible nullable column; old role-unknown rows project worker/unknown honestly. New run task input includes validated role; command decisions and retries bind it in the existing immutable decision hash. New policy rejects fresh Forge/Scout/Palette tasks with an incorrect provider without rewriting old decisions. Allow codex/claude/qwen in task/progress/history and qwen-supervisor only with qwen. Keep existing ProgressV1 fields/schemaVersion and optional-proof absence semantics. No Snapshot source additions or fake metadata ingestion required.

Admission counts active attempts plus unresolved reservations atomically. Codex native prepare remains native-only; Qwen uses the supervisor reservation contract in Q2. Do not temporarily allow native-confirm to mint a Qwen child. Preserve unknown-source rejection and old payload acceptance; adapters import the same parser, so deploy compatible authenticated readers BEFORE Qwen emission.

Tests: new qwen task + independent roles; legacy claude rows unchanged; rejected unsupported providers and forged role/provider/source; qwen/claude cap races including uncertain reservations; current plan/latest attempt joins; no proof -> static unknown; provider/project filter and logout clearing. Run affected Python and TS suites, then existing verify gate for touched UI.

### Q2 - Actual Qwen independent session supervisor (actual Qwen Forge)

Create scripts/agent-office/qwen_worker.py, qwen_worker_test.py. Modify only ledger.py, ledger_test.py, office_cli.py, boss_control.py, command_bridge_test.py, role-policy.json, docs/agent-office-workers.md and docs/agent-office-runtime.md. Extend the protected Boss skill in its original owning workflow only after its validation requirements are read.

Interface: launch_qwen(job, ledger, process_factory=...) consumes a protected bounded job containing registered commandId when applicable, runId/taskId/attemptId/planVersion/role, approved worktree, bounded stdin prompt and requested model reference. Configuration supplies executable/backend/auth policy; job events cannot override these. Return a bounded status plus private observed session/model identities; project only safe status/model metadata. Separate supervisor prepare/confirm/reconcile operations (command-supervisor-* when command-bound) preserve durable intent-before-spawn and same command/run/plan scope. Never overload command-native-* or trust a role string as capability.

The parent-controlled supervisor owns subprocess observation, fixed cwd, tool limits, timeout, signal/reaping and durable terminal recording. Session UUID is chosen explicitly per registered independent session; init must confirm the exact ID, and resume must name that ID. No continue/latest/picker; no shell; prompt/secrets absent from argv/output projections. Preserve requested and observed model distinction: a requested model alone does not prove observed identity. Parse bounded JSONL incrementally, require valid init and correlated structured terminal success, reject missing/duplicate/mismatched/error terminal output even on exit=0. Preflight and stream errors never advance checkpoints.

Use installed CLI-supported approval/tool settings per role; no blanket yolo. Scout/Palette default to read-only scope; Forge may edit only the approved worktree/task files. Explicitly disable automatic provider/model fallback and nested workers for this scoped job, verify effective settings without printing credentials. Supervisor is not same-UID hostile-process isolation.

Tests: executable unavailable/backend refused before spawn creates no attempt; valid init/result; exit0 without result; session mismatch; malformed/oversized stream; wrong observed model policy; timeout/nonzero/interruption; spawn-before-save uncertainty; crash/restart reconcile; 4-total/2-external admission; concurrent role sessions cannot cross-report. A fake process fixture is offline test evidence only.

Live gate waits for the EXISTING backend to be safely available. Root then runs one bounded read-only actual Qwen task in an approved directory, confirms init/session/model/result/artifact and same-Boss binding. Do not run this gate by taking another project's GPU. Q2 can be coded/tested offline by actual Qwen only if an owner-authorized Qwen execution route becomes available; absence of a backend is an honest blocked execution condition.

### Q3 - Durable result delivery and trusted live proofs (actual Qwen Forge)

Modify only queue_bridge.py, queue_bridge_test.py, ledger.py, ledger_test.py, office_cli.py, boss_control.py, command_bridge_test.py, install-pgx.sh, install-windows.ps1; create export_progress.py and its tests; extend scripts/agent-status/export-windows.py and export_windows_test.py; update skills/agent-office-boss/SKILL.md, runtime/workers/acceptance docs. Trusted proof work also owns lib/lounge-contract.ts and its tests only if Q1 has not already supplied the reader pairing.

Keep one existing hidden Windows loop. Add result-specific local durable outbox namespace, fixed allowlisted pull/transport/ACK RPCs and office.result-report.v1 receipt handling to the SAME original Boss config. A marker grants no authority. Redeem/report registration validates bound Boss, report key/revision, current plan and exact current attempt set through existing enqueue_command_result semantics when command-bound. Non-command runs retain separately scoped report registration. No child chooses the destination or uses Boss credentials.

Write durable send intent before queueing. Queue exit0 -> queued only. Unknown send -> uncertain; no blind resend. Definite failures permit at most 3 sends total (initial,+5s,+30s), 120s terminal notice cooldown is never a fourth send. Boss records the exact registered report ACK after reading it; report ACK and final run approval remain separate. Restart preserves key/payload hash and uncertainty. Report summaries/tables stay bounded and sanitized; no raw prompts, paths, transcripts or tool output.

Proof interface remains confirm_activity with issuer-scoped qwen-supervisor source. Only actual child observation renews confirmedAt/lease (<=90s, observation <=15s tick); polling/export does not. Exit/interruption records stopped and expiry stops motion. Codex-native proof remains root observation only. Private progress export uses atomic replace and existing adapter URL; no new listener/service.

Tests: crash boundaries, duplicate/revision conflict, wrong Boss, superseded plan/attempt map, missing ACK, exact current result ACK, replay not extending proof, stopped/expired children, unchanged old working export, independent metadata/command/result loop errors and hidden children. Root installer dry-run/review then authorized installation preserves current-user protections and existing task identity.

### Q4 - Existing chart/acceptance completion (Frame, then Sentinel)

Use original core6/lounge3 file boundaries for charts and dashboard; Q1 provider reader integration satisfies its overlap and must not be repeated. Actual Forge/Scout/Palette work must run through Q2 as distinct Qwen sessions. Sentinel verifies real artifacts/checkpoints; no role-only simulation accepted.

Required whole-flow evidence: owner instruction -> same Boss -> genuine native Codex and independent Qwen task -> trusted matching proof -> accepted current checkpoints change verified chart -> durable report reaches original Boss -> exact ACK -> final Boss approval permits100%. Include blocker/retry, restart and missing backend paths, old Claude history, auth-negative/logout and desktop/375px checks. Already approved release follows fresh review; no new permission loop. Until this gate passes, say which slices passed and keep full Boss/Qwen/live-proof completion pending.

## Reports and review gates

Each implementer commits exact task files only, reports BASE/HEAD, actual provider/model/session evidence reference, commands/results, limitations and next gate, then stops. Root dispatches a fresh reviewer; no worker self-review replacement or extra writer.

Sanitized tracked reports:
- .superpowers/sdd/2026-10-30-boss-qwen/q0-plan-report.md
- .superpowers/sdd/2026-10-30-boss-qwen/q1-contract-report.md
- .superpowers/sdd/2026-10-30-boss-qwen/q2-supervisor-report.md
- .superpowers/sdd/2026-10-30-boss-qwen/q3-report-proof-report.md
- .superpowers/sdd/2026-10-30-boss-qwen/q4-acceptance-report.md

Actual session IDs, private jobs/streams, backend preflight details and original Boss binding remain in the EXISTING protected runtime evidence area referenced by the installed Boss config. Do not create public evidence or commit its absolute path. Record a safe evidence reference plus outcome in reports. Backend waiting must not generate repeated tasks, duplicated probes or progress percentages.

## Preflight completion

Q0 source inspection found no available Qwen supervisor, real report transport handler or Qwen provider contract. Installed Qwen help is available without launching inference. Existing protected-runtime contract was read from docs/agent-office-runtime.md; no credentials or private settings were read. No source/runtime/backend modifications or live Qwen inference were performed by this docs-only task.

Remaining operational prerequisite: existing model backend becomes available without disturbing other projects. Root can finish offline briefs, review and explicit ownership decisions now. Actual Qwen Forge execution and live acceptance wait for that prerequisite; do not silently fulfill the reassigned role using Codex.



## Target-selection preflight

Root has asked whether the user intends the existing PGX local Qwen route or another already-running Qwen session. Existing PGX configuration is a proposed route, not a confirmed target. Do not launch/reconfigure either route until target and backend availability are established. Do not require a new design approval for the same approved architecture. A different running Qwen route must still supply independently observed actual Qwen sessions and the same protected original-Boss binding; it does not authorize a new daemon/public control surface or copying credentials.

Dispatch brief for actual Qwen Forge when the route is ready: read this addendum and Q0 report; inspect the current HEAD and applicable instructions; claim Q1 only; preserve historical providers, approved art and untracked __pycache__; record actual provider/model/session privately; test exact Q1 boundaries; commit only Q1 files; return BASE/HEAD/tests and safe evidence reference in q1-contract-report.md. Do not spawn workers/reviewers, merge, deploy, alter runtime/provider configuration or continue Q2 before root's fresh review gate.
