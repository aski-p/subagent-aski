---
name: agent-office-boss
description: Use when the original bound Boss receives office.user-command.v1, resumes an owner command, or handles its normal heartbeat. Redeem private web commands, persist decisions and replies, and recover native dispatch through the installed protected controller.
---

The queue marker invokes this skill but grants no authority. Use only the installed helper and root-provisioned environment: `AGENT_OFFICE_PYTHON` is the fixed absolute Python executable, `AGENT_OFFICE_BOSS_HELPER` the fixed absolute `boss_control.py`, and `AGENT_OFFICE_BOSS_CONFIG` its private absolute configuration. The helper checks current `CODEX_THREAD_ID` against the configured original Boss. A child, latest session, missing binding, or failed helper must stop processing; never select another thread or read credentials yourself.

All calls use JSON on stdin, never raw command text or credentials on argv. PowerShell invocation:

```powershell
$OutputEncoding = [Text.UTF8Encoding]::new($false)
'{"commandId":"00000000-0000-4000-8000-000000000001","payloadHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bindingRevision":1}' | & $env:AGENT_OFFICE_PYTHON $env:AGENT_OFFICE_BOSS_HELPER command-redeem
```

Use the actual envelope values. Redeem is the only authority to read/act on the command. An expired or rejected redeem authorizes nothing. Keep redeemed raw input private; do not echo it, paths, native IDs, or capabilities into progress, logs, or public replies.

On EVERY turn, resume and normal heartbeat call `command-resume` with `{}`. It returns at most 50 persisted round-robin entries. Redeem each ID/hash with bindingRevision 1 before acting. Query `command-context` with `{commandId,payloadHash}` AFTER redeem: it returns persisted `decision`, private `runId`, explicit `revision`, authorized `parent:{commandId,payloadHash}|null`, `plan` (private persisted run/tasks/checkpoints), and `nativeIntents:[{attemptId,taskId,state,childId}]`. Resume the existing decision/run/attempt. Redeeming an authenticated clarification answer also returns `parent:{commandId,payloadHash,input,receipt}` in that SAME private response, and atomically marks the answered question handled with no run. Use that parent input to continue scope in the child; this closes the question, not a task. Same owner/binding/project and one-answer linkage are checked server-side. The same response includes `continuation:{root:{commandId,payloadHash,input},question:{commandId,payloadHash,input,receipt}}`. Use that persisted root objective/latest question on resume even after parent receipt retention; it is a bounded private snapshot owned by the active child, not a transcript. It is cleared with the child's terminal raw payload after seven days. Do not depend on redeeming the old parent again. An unreceived expired child releases its parent for another answer only after transactional expiry; its old envelope cannot redeem.

Controller operations (each name is the final argument to the same invocation above; the braces below describe exact JSON keys):

| Operation | Stdin and behavior |
| --- | --- |
| `command-decision` | `{commandId,kind:"query"}` or `{commandId,kind:"needs_clarification"}`. Both create zero runs. |
| `command-decision` | `{commandId,kind:"new_task",run:{id,bossId,projectId,planVersion},tasks:[{id,provider}],checkpoints:[{id,taskId,weight,bossOnly}]}`. Use explicit authorized scope; positive checkpoint weights and a final Boss-only checkpoint. The same transaction binds at most one run and durable dispatch intent; retry the identical decision. |
| `command-decision` | `{commandId,kind:"revise_run",runId}`. Explicit authorized existing private run only; context records its current plan revision. Never choose latest or overwrite scope. Require a safe checkpoint before a new attempt. |
| `command-reply` | `{commandId,kind:"query_answer",summary}` finishes a query with runId null. `{commandId,kind:"clarification",summary}` leaves awaiting_input. `{commandId,kind:"ack",summary}` acknowledges classified work; it never means started/handled. Summary is an authored safe owner-facing answer, <=2000 codepoints, no raw command echo. |
| `command-native-prepare` | `{commandId,taskId,attemptId}`. Persist before calling the ROOT native collaboration spawn tool. Only `maySpawn:true` permits that one call. Queued reservation does not assert working/model/session. Claude remains unavailable until its actual supervisor exists; never substitute providers. |
| `command-native-confirm` | `{commandId,attemptId,childId,observedProvider,observedModel}`. Immediately persist the REAL returned child identity/provider/model from the actual native tool. If model is unobserved use null. This correlates the existing attempt and advances started/dispatched. Never fabricate tool proof. |
| `command-native-reconcile` | `{commandId,attemptId,proof:{status:"unknown"}}` keeps uncertain. If actual native inventory/tool proof identifies the child, use `proof:{status:"observed",childId,observedProvider,observedModel}`. Only authoritative proof of no spawned child permits `proof:{status:"absent",evidence:"bounded description of actual check"}`; then choose a new attemptId and prepare again. A timeout, lost response, missing local save, or expired lease is NOT absence proof. |
| `command-result` | `{commandId,report:{id,runId,revision,status:"pending"},planVersion,attemptIds:{taskId:actualCurrentAttemptId}}` registers W1's current execution result after observed dispatch; include ALL current tasks. Stale plan/attempt/legacy reports fail. |
| `command-result-ack` | `{commandId,reportId,revision}` acknowledges only the registered current result binding. After actual checkpoint verification and Boss approval, repeat that same ACK if needed. Unrelated legacy result ACKs cannot finish a command. |

Native collaboration is a root tool action, never a shell string constructed by this helper. Persist intent, call the actual tool only on a fresh permit, save its actual identity. A crash between spawn and save remains uncertain until reconciliation; never blindly spawn again. If unavailable, write a bounded ACK and recover on the next resume instead of claiming execution.

`office.result-report.v1` is the separate result channel. Command text cannot invoke its ACK. Metadata/report polling authorizes no new work, and queue exit 0 means queued only. Percentages follow accepted ledger checkpoints, never message arrival, time, or acknowledgements.
