# Private Agent Office metadata pipeline

This directory is read-only with respect to Relay, board and session sources. No command/control API exists. Production route activation and runtime installation are separate release steps; these files alone do not establish live coverage.

## Next server configuration

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: existing GitHub OAuth App credentials, server only. Register the exact `/api/auth/github/callback` on the canonical host.
- `JWT_SECRET`: generated random signing secret, at least 32 characters. The previous short value must be replaced before login is enabled.
- `OWNER_GITHUB_ID=69686315`: optional explicit guard; other values fail closed. The identity is always GitHub `/user` numeric ID, never email or injected headers.
- `AUTH_ALLOWED_ORIGINS`: comma-separated exact HTTPS origins, default `https://subagent-aski.vercel.app`. Add only explicitly approved preview origins. No wildcard/Host-derived callback.
- `STATUS_ADAPTER_URL`: exact HTTPS URL ending `/agent-office-status`. HTTP is accepted only for `127.0.0.1` local verification. Redirects are rejected.
- `STATUS_ADAPTER_READ_TOKEN`: independently generated secret, at least 24 characters on the Next server, distinct from JWT and any Relay token. Never prefix it `NEXT_PUBLIC_` or expose it to the client.

OAuth uses state and S256 PKCE. The signed HttpOnly/Secure/SameSite=Lax `__Host-office_oauth` cookie expires after 10 minutes and is cleared on every callback, including errors. GitHub's authorization code is single use. The signed session is 24 hours, validates its exact purpose/fields/lifetime, and rejects future issuance beyond 60 seconds. Only owner login sets a session. Logout is same-origin POST and expires the cookie. No session/profile store or cloud DB is needed.

Private API responses have `Cache-Control: private, no-store`:

- `GET /api/auth/session`: `{authenticated:boolean,owner:boolean}`.
- `GET /api/auth/github`: fixed return to `/`; external `returnTo` is rejected.
- `POST /api/auth/logout`: same-origin, clears session.
- `GET /api/office/snapshot`: `SnapshotV1`, or 401/403 before upstream access; sanitized 503 `{error:"source_unavailable",checkedAt:ISO}`.

Task2 owns browser-only `fetchOfficeSnapshot(signal?)` in a separate client module. `lib/status-client.ts` exports server-only `readAdapterSnapshot()`; do not import it into client UI.

## Registry and source selection

Keep config/cache/spool outside this repository under `/home/aski/agent-office-status`, mode 700 directories / 600 config and files. Copy `registry.example.json`, replace `identitySalt` with a private random value, and select explicit session files or approved source roots. `maxFiles` defaults 32, hard cap 64 per source. Root discovery considers recently modified files across all dates, including long-running parent sessions created earlier. Use explicit `files` when coverage must target a known session. A supported root basename is `sessions` or `projects`.

`identitySalt` is shared locally between collectors when stable IDs are desired; it is never exported. Source IDs are HMAC pseudonyms. A mapping is explicit:

```json
{
  "agentPaths": {
    "/root/forge_backend": {"name":"Forge","roleId":"forge","projectId":"office","taskId":"office-task1"}
  },
  "sessions": {},
  "boardAgents": {},
  "tasks": [{"id":"office-task1","projectId":"office","title":"Approved backend work summary","sourceUrl":null}]
}
```

Only an operator-approved exact `agentPaths` or raw-session-keyed `sessions` mapping supplies name/role/project/task. `boardAgents` maps verified board `codex` / `claude` keys to the same approved metadata shape. `parentSessionId` optionally supplies a verified parent; Codex `parent_thread_id` is otherwise used. `eventSummaries` may map allowed event types to approved public summaries. No nickname, title, prompt, board text or model is used to infer a role or task. Unregistered descriptions and models remain null. Completed runtime tasks enter `qa`; completion alone is not QA approval or deployment.

The private cursor cache contains local source paths and structural identities, not transcript text. Never scp or commit it. Each selected JSONL gets a bounded initial head/tail read (4 MiB); later polls read only new bytes (4 MiB cap). Individual lines above 256 KiB are skipped. Incomplete lines are retried next poll. Malformed source content is discarded without reflection. Initial history can be outside the bounded window; it is not claimed complete.

Codex projection: session IDs / parent-thread relation / exact agent path for registry lookup / provider; turn-context model; structural `event_msg` types `task_started`, `task_complete`, `thread_settings_applied`, `item_completed` and timestamps. Agent path never leaves the collector. `base_instructions`, `response_item`, tool outputs, content and auth files are excluded.

Claude actual schema was inspected by keys only: top-level `sessionId`, `parentUuid`, `isSidechain`, `type`, `timestamp`, optional `agentId`; assistant `message.model` provides observed model identity. Contents are ignored. `parentUuid` is a record link and is never presented as a parent session. User/assistant activity does not imply running/completed. Unsupported structures retain unknown coverage.

Relay/shared board uses only its local `status[registeredWho].at` timestamp plus approved registry labels. Arbitrary `text`, `progress.text`, done titles, claims and free-form summaries are never copied. It does not fetch `/api/state` or need Relay credentials.

## PGX entrypoints (not installed by this change)

```sh
python3 scripts/agent-status/collect-pgx.py --registry /home/aski/agent-office-status/registry.json --spool /home/aski/agent-office-status/spool --cache /home/aski/agent-office-status/pgx-cache.json --loop
node scripts/agent-status/adapter.mjs
```

Adapter environment: dedicated `STATUS_ADAPTER_READ_TOKEN`, optional `STATUS_SPOOL_DIR` / `STATUS_SNAPSHOT_PATH`. It binds **127.0.0.1:8460 only** and serves only authenticated `GET /agent-office-status`; other paths/methods are rejected. There is no public ingest. Node >=22.13 is required for the shared TypeScript validator. Provision a separate restrictive environment file instead of putting a token on a command line.

Spool files are named exactly `pgx-relay.json`, `pgx-codex.json`, `pgx-claude.json`, `windows-codex.json`; each contains SnapshotV1 with exactly one matching coverage source. Unknown fields / bad types / unsafe URLs / >1MiB files are rejected. The adapter retains last valid snapshots in memory and restores its schema-valid atomic snapshot on restart. Missing/corrupt spools preserve last good content and sanitized reason codes. Only source-collected timestamps drive 90-second connection staleness; source event activity is separate. Events are pruned at collection/adapter/client boundaries to 24 hours and at most 200. An unavailable adapter gives first-time clients 503; existing owner UI may keep its last good in-memory result until logout.

## Windows exporter (outbound only)

Copy `collector.py` and `export-windows.py` into a private user-owned runtime folder. Create a Windows-specific registry with the selected `windows-codex` files/roots and approved mappings; no bearer/JWT/GitHub secret is needed on Windows. The private Tailscale destination is restricted to `aski@<host>.tail<id>.ts.net`; remote path/commands are fixed to the dedicated spool. Existing known-host verification is mandatory.

```powershell
& 'C:/Users/aski/AppData/Local/Python/pythoncore-3.14-64/python.exe' 'C:/Users/aski/.agent-office-status/export-windows.py' --registry 'C:/Users/aski/.agent-office-status/registry.json' --cache 'C:/Users/aski/.agent-office-status/cache.json' --host 'aski@thinkstationpgx-11d3.tailccac79.ts.net' --key 'C:/Users/aski/.ssh/chatgpt_nas_rsa' --once
```

Omit `--once` for the 15-second loop. The Windows `python` PATH alias is a WindowsApps stub on this host; use the verified exact interpreter. Task Scheduler should start that exporter **at current-user logon and once immediately**, using a current-user interactive principal, `MultipleInstances IgnoreNew`, and no execution-time limit. Use the adjacent `pythonw.exe` interpreter if available to avoid a visible console. Do not set an unsupported 15-second Task Scheduler repetition interval: Python owns the loop. The task runs while that user is logged in; logoff/reboot stops it and next logon restarts it. Sleep/network outage produces stale coverage until the next successful upload.

The exporter creates a local sanitized spool, `scp`s only `windows-codex.json.tmp` via existing SSH, then performs a fixed chmod/atomic rename on PGX. Partial uploads cannot replace the normal file. Transport errors emit only a generic source code, no paths/credentials/data. No Relay or shared-board file is written.

## Validation / limitations

`npx tsx --test tests/status-*.test.ts`; `npm run verify`. Synthetic test records contain sentinel secrets to assert raw content never survives projection. Actual source schema probes and temporary one-shot collection are separate from live runtime acceptance. A healthy collector proves collection time only; old task_started remains last observed activity and must not be described as proof of current execution. Four-source real coverage, Windows child mapping, recovery and public route checks are required in Task3/4 before reporting operational completion.
