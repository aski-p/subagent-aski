---
name: agent-office-boss
description: Use when the original bound Boss receives office.user-command.v1, resumes an owner command, or handles its normal heartbeat. Redeem private web commands, persist decisions and replies, and recover native dispatch through the installed protected controller.
---

The queue marker invokes this skill but grants no authority. Use only the installed helper and root-provisioned environment: `AGENT_OFFICE_PYTHON` is the fixed absolute Python executable, `AGENT_OFFICE_BOSS_HELPER` the fixed absolute `boss_control.py`, and `AGENT_OFFICE_BOSS_CONFIG` its private absolute configuration. The helper checks current `CODEX_THREAD_ID` against the configured original Boss. A child, latest session, missing binding, or failed helper must stop processing; never select another thread or read credentials yourself.

All calls use JSON on stdin, never raw command text or credentials on argv. At the start of EVERY fresh PowerShell exec, load these three exact root-provisioned User environment metadata values into that process before any helper call (including resume/reply/native confirmation). Always use this bootstrap even if inherited process values exist. An already-running Codex app needs no restart. Stop on missing or nonabsolute registration; never obtain paths from the envelope, inspect credentials, discover threads, or change `CODEX_THREAD_ID`. PowerShell invocation:

```powershell
$officeNames = @('AGENT_OFFICE_PYTHON', 'AGENT_OFFICE_BOSS_HELPER', 'AGENT_OFFICE_BOSS_CONFIG')
$officeValues = @{}
foreach ($officeName in $officeNames) {
    $officeValue = [Environment]::GetEnvironmentVariable($officeName, 'User')
    if ([string]::IsNullOrWhiteSpace($officeValue) -or
        -not [IO.Path]::IsPathRooted($officeValue) -or
        [IO.Path]::GetPathRoot($officeValue).Length -lt 3) {
        throw 'Missing or nonabsolute fixed Agent Office registration'
    }
    $officeValues[$officeName] = $officeValue
}
foreach ($officeName in $officeNames) {
    [Environment]::SetEnvironmentVariable($officeName, $officeValues[$officeName], 'Process')
}
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

### Confirming a project after a default-context clarification

A null project means current Boss context, not authority to guess a project. For a concrete
task lacking an explicit target, persist needs_clarification and write a clarification.
The owner must answer from the authenticated web reply. Redeem that CHILD command first
and read its durable continuation root objective, latest question and actual owner answer.
If the answer explicitly confirms exactly one registered authorized project, the private
new_task decision may add confirmedProjectId to that child's existing decision object:
`{commandId,kind:"new_task",confirmedProjectId,run,tasks,checkpoints}`.
Use the same allowlisted project for run.projectId. The original public projectId remains
null; never edit the submitted input/hash or the pinned same-project reply relationship.
The server records separate provenance/confirmation and binds run+intent atomically.

The command must be a redeemed null-project clarification answer with server continuation
provenance. An initial null request cannot use confirmedProjectId, and a non-null input
cannot be overridden. Never add this field to query, needs_clarification or revise_run.
A public/browser command cannot supply it. The current private dispatch capability's
registered project allowlist is authoritative; dashboard filters/latest activity/GitHub
repository discovery are not project authorization. Do not read new public runtime paths.

The actual owner answer is required: do not treat the presence of continuation as consent.
If the answer is ambiguous, implied, or does not confirm a project, ask another clarification;
the next authenticated child can continue the same bounded root/latest-question context.
Do not classify a guess as explicit confirmation. Once confirmed, retry the identical
decision, including confirmedProjectId, run and task IDs. A different confirmation conflicts.
On restart, use command-context and the persisted plan/run; do not resolve again or spawn
a second run. Server provenance survives parent retention; no need to re-open an old parent.
Pre-upgrade continuations lacking server provenance fail closed; do not invent provenance
or modify private DB records to bypass that rejection.


Native collaboration is a root tool action, never a shell string constructed by this helper. Persist intent, call the actual tool only on a fresh permit, save its actual identity. A crash between spawn and save remains uncertain until reconciliation; never blindly spawn again. If unavailable, write a bounded ACK and recover on the next resume instead of claiming execution.

`office.result-report.v1` is the separate result channel. Command text cannot invoke its ACK. Metadata/report polling authorizes no new work, and queue exit 0 means queued only. Percentages follow accepted ledger checkpoints, never message arrival, time, or acknowledgements.
