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
