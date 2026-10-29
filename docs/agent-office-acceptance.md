# Agent Office acceptance evidence (template)

This is a sanitized template. Real Boss/thread UUIDs, probe/report IDs, host names, private paths, transcripts and raw tool output stay in private runtime evidence (for example `queue-probe.json`, directory 0700, file 0600) and never enter this repository.

## Gate 1: bound Boss queue transport

Reusable code: `scripts/agent-office/queue_bridge.py` (unit tests: `python3 -m unittest discover -s scripts/agent-office -p queue_bridge_test.py -v`).

Transport rules the evidence must respect:

- Target is the exact original parent session UUID read from the original Windows `CODEX_THREAD_ID`; never a name, "latest" match, or a child environment value.
- The Codex executable is an absolute runtime-configured path; the child runs as a fixed argument array (`queue --thread UUID --message ENVELOPE`), no shell, `CREATE_NO_WINDOW` on Windows.
- A zero exit is `queued` only. `acknowledged` requires the Boss to read the report key and record an ack through the helper. Timeout or interrupted send is `uncertain`; explicit rejection or a missing executable is `retry_wait`.
- Do not send a duplicate probe to re-prove an already acknowledged receipt. Never send probes to other chats.

| Check | Expected | Result | Evidence (private reference only) |
|---|---|---|---|
| Probe target bound to original parent UUID | exact UUID match, recorded privately | — | `<private evidence ref>` |
| Bridge result | `queued`, never `acknowledged` | — | `<private evidence ref>` |
| Probe arrived in the original Boss chat | incoming message shows the probe reportId | — | `<private evidence ref>` |
| Boss acknowledgement recorded | ack time for the same reportId/revision | — | `<private evidence ref>` |
| No visible console window | no CMD window on Windows during send | — | `<private evidence ref>` |
| Failure path (if any) | `retry_wait`/`uncertain` with generic errorCode, diagnosis noted | — | `<private evidence ref>` |

Recorded by: `<role>` · Date: `<YYYY-MM-DD HH:MM TZ>` · Source commit: `<sha>`

Help text or a zero exit code alone does not pass this gate.

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

### Shared office reader and presentation evidence

Task 5 connects the owner-only room to the existing progress reader. The room uses
six fixed role characters and displays work effects only when the current task,
run plan, attempt, provider, source, and unexpired activity proof agree. A separate
labeled preview demonstrates effects without operational records. A missing proof
keeps a working task in execution-confirmation-waiting state; a current run plan
must match the task plan before it can be selected or shown.

Synthetic browser fixtures exercise the built dashboard, including public/private
same-ID isolation, provider and task selection, verified versus self-reported
percentages, proof expiration while paused and hidden, a fresh export carrying an
old proof, and logout with a pending progress response. They also check the room
sends no work or command POST. Component browser fixtures cover sprites, movement,
controls, reduced motion, hidden state, and 375px layout. These tests do not prove
a native child is alive or that a real provider executed a task.

The activity proof producer, reader-first deployment, authenticated canonical
app verification, and genuine mixed-provider execution remain separate acceptance
gates. No operational percentage or proof is synthesized as a fallback.
