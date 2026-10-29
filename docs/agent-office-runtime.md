# Agent Office command runtime

W3 adds the command channel to the existing metadata exporter. It does not install the deferred report outbox/progress exporter or Claude supervisor. Actual Windows child visibility, authenticated HTTPS intake, original Boss receipt/reply, clarification answer and native new-task proof require root acceptance after review.

## Fixed private configuration

Runtime values belong outside source, private to the current OS user. Never put actual IDs, native session paths, credentials or tokens in committed config/fixtures. Windows installation must keep runtime/outbox/config on its current-user-only ACL. POSIX directories are 0700 and files 0600.

Both protected JSON configs contain `bossId` (exact original Codex thread UUID), `bindingRevision:1`, absolute `sshExe`, `identityFile`, fixed tailnet `host`, absolute PGX `pythonPath`, `cliPath`, `dbPath`, and `capabilityFiles:{bridge,redeem,reply,dispatch,boss}` pointing to the existing core-issued protected files. The `boss` entry is the original core Boss credential; scoped command capabilities cannot register native observations/results. The Windows bridge config also contains absolute `codexExe` and `outboxPath`. There are no executable/host/path/owner/model overrides in event JSON. Root provisions/revokes scopes through existing Ledger APIs, never through this transport.

`AGENT_OFFICE_PYTHON`, `AGENT_OFFICE_BOSS_HELPER` and `AGENT_OFFICE_BOSS_CONFIG` in the original Boss environment point to the fixed installed Python, `scripts/agent-office/boss_control.py`, and private Boss config. The helper compares current `CODEX_THREAD_ID` to that exact binding on every operation. Child or latest-session selection is forbidden. Root registers these three fixed metadata paths in the Windows User environment at installation. Every fresh PowerShell exec in the existing original Boss must run the exact User-to-process bootstrap in the installed skill before invoking any operation, including resume/reply/confirmation. It reads only those three exact names, requires nonempty absolute Windows paths, validates all before setting process values, and replaces stale inherited values. Fresh shells do not preserve previous shell assignments; this bootstrap works without restarting the already-running Codex app. It never reads credentials, accepts payload paths, discovers threads, or changes CODEX_THREAD_ID; the helper still enforces the protected original-thread/config binding. The skill contains the bootstrap and exact JSON API reference.

## Reviewed installation

Root first runs skill quick_validate and the independent reference behavior GREEN test, then source review. On PGX run the fixed checked-in `scripts/agent-office/install-pgx.sh` with the absolute private module directory and existing private DB path. It backs up helper sources, copies only ledger/commands/authority/CLI, and runs compatible CommandStore migration without bootstrapping, issuing authority, dropping a DB, or starting a service. Existing adapter W2 maintenance invokes purge hourly even with intake disabled; configure its already documented maintenance capability. No second purge timer exists.

On Windows run `scripts/agent-office/install-windows.ps1` with `-DryRun` and fixed `-PythonwPath`, `-RegistryPath`, `-CachePath`, `-HostName`, `-IdentityFile`, `-CommandConfigPath`, `-BossConfigPath`, and optional private `-RuntimeDirectory`. Review then repeat without DryRun. It requires the EXISTING `AskiAgentOfficeMetadataExporter`, backs up its XML/config/modules/skill, copies the fixed modules and Boss skill, then updates that same task. It preserves current-user interactive logon, pythonw.exe, IgnoreNew and no execution-time limit. It never starts the task or a second runner. Root controls activation/restart after review. Restore backup files and register the saved task XML to roll back; no recursive delete is needed.

The installed exporter accepts optional `--command-config ABSOLUTE_PRIVATE_CONFIG`; absent means original metadata-only behavior. The same non-overlapping loop independently attempts metadata and command work, then waits for the remainder of its 15-second tick. A slow network/helper can extend delivery latency; this is not an exact 15-second SLA. Metadata failure does not skip the command tick. Command plaintext never enters metadata collector/cache/spool/log output. All local Codex/SSH children use argv arrays, shell false, bounded deadlines and CREATE_NO_WINDOW on Windows.

## Delivery and recovery

The bridge writes a durable local command-send intent before invoking the configured Codex queue. Command outbox tables are separate from the result namespace. Queue exit 0 means `queued`, never received or started. W1 supplies at most three total claims: initial, failure +5 seconds, second failure +30 seconds. A failed terminal attempt has a 120-second safe-notice cooldown signal; it never queues a fourth message. Known nonzero exit/OSError can retry under W1; timeout, interrupted or lost send/save is uncertain. Recovery retries only a saved transport event, not the queue. Expired lease fencing remains W1 authority and never grants permission to resend possible delivery.

The queue sends only `$agent-office-boss`, `office.user-command.v1`, command ID/hash/binding revision. The marker grants no authority. Only exact original Boss private redeem reveals raw input. Queries classify and persist a bounded answer with no run. Clarification parents wait for an authenticated same-owner/binding/project child. Redeeming that answer returns the private parent context in the same transaction and marks only the answered question handled/stage handled with no run; the child carries continued scope. This follows the root-approved lifecycle ruling, preserving immutable classification and normal terminal 7/30-day retention. Expiring an unreceived answer releases parent answered_by in the same expiry lock, allowing a new answer and denying late old envelopes. Before closing the parent, the same authorized transaction snapshots only the root original input and latest question into child continuation_context (<=64KiB UTF-8). Repeated child redeem returns the same verified continuation across restart and parent 7/30-day cleanup; the active child never expires. Its continuation is cleared with its terminal raw/reply at seven days and is never projected, logged, or copied into a tombstone. command-context exposes verified parent linkage from the snapshot even after parent receipt removal. Resume remains W1's persisted round-robin 50.

For native work, classification atomically binds one run/plan/checkpoints and dispatch intent. Root calls `command-native-prepare` BEFORE its actual collaboration spawn. A reservation consumes the shared 4-total/2-Claude slot budget, while tasks remain queued and no attempt/model/session is invented. A returned `maySpawn:true` permits one tool call. Repeated prepare returns false and recovery context exposes that uncertain reservation. Root records the actual returned native child/provider/model through confirm; only then does Ledger create a working attempt and command started/dispatched. Unknown spawn-before-save remains uncertain until actual native reconciliation. Absence requires authoritative evidence; an elapsed timeout or expired lease is insufficient. Claude reservations fail supervisor_unavailable in W3.

Observed result registration uses fixed `command-result` -> `Ledger.enqueue_command_result` with current plan version and complete actual current attempt map. `command-result-ack` requires this command's exact current registered result; it cannot adopt legacy/unrelated reports. The separate `office.result-report.v1` report transport remains deferred. Command receipt ACKs never mean completion; actual checkpoints/Boss approval/current result ACK determine handled.

Owner-only replies are deliberately authored summaries. Exact full command echoes and source substrings >=16 codepoints are rejected; ordinary short/common Korean words may appear in an answer (for example 확인 -> 확인했습니다). This is a narrow chat usability rule, not a general information-flow guarantee. Existing runtime identifier/path/credential guards and metadata/list/progress boundaries remain enforced.

### Owner Boss conversation

The authenticated owner dashboard places the conversation before the work filters.
The composer starts with the current Boss target; selecting a dashboard filter does
not change it. Enter inserts a newline, and Ctrl/Cmd+Enter sends. A receipt says
only the state actually returned by the command service; acceptance is not proof
that Boss received or started the work. Authored query answers and clarification
requests appear in the history, and an awaiting clarification offers 이어 답변.
The draft remains in authenticated browser memory and is cleared on logout or
authorization failure. For an unknown submission outcome the same request can be
explicitly checked again with the same identifier.

The browser fixture test intercepts synthetic API responses on the real Next page;
it is not evidence of a deployed endpoint, native Boss work, or model execution.
Production acceptance of that chain is a separate integration gate.


### Reviewed default-context project resolution

Owner commands retain their original public projectId/input hash, including null.
After a null-project clarification answer is authenticated and redeemed, the original
bound Boss may include confirmedProjectId only in the private new_task decision.
The Boss must read an explicit owner confirmation of one project in that answer;
ambiguity requires another clarification. The existing registered dispatch capability
project allowlist is authoritative, with run.projectId equal to the confirmed project.
Browser filters, repository discovery and initial null text confer no target authority.

The inbox stores compact private continuation provenance on redeem and a separate
confirmation bound to the immutable decision hash. Confirmation, native run binding and
dispatch intent share one SQLite transaction. Ledger independently checks that persisted
effective project and current scope even on direct calls/retries. Parent retention does
not invalidate an already redeemed active child's provenance. Non-null overrides and
confirmation on query/clarification/revise are rejected. Pre-upgrade children without
provenance fail closed; operators must not fabricate records to bypass it.

Receipt GET now starts with the most recent50 records and owner-bound opaque cursors walk
toward older sequence IDs. New submissions do not shift an existing older-page boundary.
The composer refreshes its loaded pages with current server state by receipt ID, bounded
to20 pages/1,000 records per mount, and generation-fences obsolete refresh completions.
This does not expand the separate50-original authenticated memory map or public projection.
