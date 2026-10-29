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

Keep config/cache/spool outside this repository under `/home/aski/agent-office-status`, mode 700 directories / 600 config and files. Copy `registry.example.json`, replace `identitySalt` with a private random value, and select explicit session files or approved source roots. `maxFiles` defaults 32, hard cap 64 per source. `discoveryBudget` independently caps visited directory entries (default 2048, maximum 8192); roots are capped at eight. Explicit `files` are prioritized before discovered candidates, with at most 64 explicit candidates checked. A limited traversal or selected-file cap produces `reasonCode: discovery_limited`; it never claims archive-wide coverage. Root discovery considers recently modified files across all dates, including long-running parent sessions created earlier. Use explicit `files` when coverage must target a known session. A supported root basename is `sessions` or `projects`.

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

The private cursor cache contains local source paths and structural identities, not transcript text. Never scp or commit it. Each selected JSONL gets a bounded initial head/tail read (4 MiB); later polls read only new bytes (4 MiB cap). Individual lines above 256 KiB are skipped. Allowed-size incomplete lines are retried next poll; oversized incomplete records advance in bounded discard-until-newline mode, so later completion events remain reachable. Initial head/tail alignment never uses an unbounded line read. Malformed source content is discarded without reflection. Initial history can be outside the bounded window; it is not claimed complete.

Codex projection: session IDs / parent-thread relation / exact agent path for registry lookup / provider; turn-context model; structural `event_msg` types `task_started`, `task_complete`, `thread_settings_applied`, `item_completed` and timestamps. Agent path never leaves the collector. `base_instructions`, `response_item`, tool outputs, content and auth files are excluded.

Claude actual schema was inspected by keys only: top-level `sessionId`, `parentUuid`, `isSidechain`, `type`, `timestamp`, optional `agentId`; assistant `message.model` provides observed model identity. Contents are ignored. `parentUuid` is a record link and is never presented as a parent session. User/assistant activity does not imply running/completed. Unsupported structures retain unknown coverage.

Relay/shared board uses only its local `status[registeredWho].at` timestamp plus approved registry labels. If that board explicitly writes Korean local times without an offset, set `sources.pgx-relay.naiveTimeZone` to `Asia/Seoul` (as in the example). Only this configured board source accepts the strict naive format `YYYY-MM-DD HH:mm` and converts it to UTC using Python zoneinfo. Without the option, naive values remain null; aware ISO timestamps retain their own offset behavior. Malformed dates remain null. An invalid/unavailable timezone fails only that source, retaining its last good spool while the other collectors continue; the host timezone is never inferred. Arbitrary `text`, `progress.text`, done titles, claims and free-form summaries are never copied. It does not fetch `/api/state` or need Relay credentials.

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

Omit `--once` for the 15-second loop. The Windows `python` PATH alias is a WindowsApps stub on this host; use the verified exact interpreter. Task Scheduler should start that exporter **at current-user logon and once immediately**, using a current-user interactive principal, `MultipleInstances IgnoreNew`, and no execution-time limit. Use the adjacent `pythonw.exe` interpreter if available to avoid a visible console. The exporter must also pass Windows CREATE_NO_WINDOW to each SSH/scp child; pythonw alone does not hide child console applications. Do not set an unsupported 15-second Task Scheduler repetition interval: Python owns the loop. The task runs while that user is logged in; logoff/reboot stops it and next logon restarts it. Sleep/network outage produces stale coverage until the next successful upload.

The exporter creates a local sanitized spool, `scp`s only `windows-codex.json.tmp` via existing SSH, then performs a fixed chmod/atomic rename on PGX. Partial uploads cannot replace the normal file. Transport errors emit only a generic source code, no paths/credentials/data. No Relay or shared-board file is written.

## Validation / limitations

`npx tsx --test tests/status-*.test.ts`; `npm run verify`. Synthetic test records contain sentinel secrets to assert raw content never survives projection. Actual source schema probes and temporary one-shot collection are separate from live runtime acceptance. A healthy collector proves collection time only; old task_started remains last observed activity and must not be described as proof of current execution. Four-source real coverage, Windows child mapping, recovery and public route checks are required in Task3/4 before reporting operational completion.

## Owner runtime project catalog

The bare adapter URL still returns SnapshotV1. The only additional adapter URL is authenticated GET `/agent-office-status?view=progress`; duplicate or other query parameters fail closed. Keep `STATUS_ADAPTER_URL` as the exact bare URL: the server client adds the fixed query. Owner-only `GET /api/office/progress` returns strict ProgressV1 with `Cache-Control: private, no-store`. Unauthorized requests never access the adapter.

`STATUS_CATALOG_PATH` defaults to `/home/aski/agent-office-status/projects.json`. This private runtime file contains exactly `{"schemaVersion":1,"projects":[{"id":"private-example","label":"Synthetic engine","repositoryUrl":"https://github.com/example/private-engine","visibility":"private"}]}`. Actual records belong only in private runtime configuration, never source or public fixtures. IDs are opaque projections, not filesystem paths. A null repositoryUrl is allowed; otherwise it must be a canonical HTTPS GitHub repository URL without credentials, query, or fragment.

Catalog registration is independent of agent activity and does not broaden GitHub OAuth permissions. Registered projects appear even with zero agents or tasks. Their owner-only source link opens GitHub using the owner's existing access. Public project/evidence APIs remain separate; private selector values never request public project runs, including when IDs overlap.

`STATUS_PROGRESS_PATH` defaults to `/home/aski/agent-office-status/progress.json`. Missing progress spools yield empty runs/tasks/reports without inferring work from metadata. Malformed progress spools fail with sanitized 503. The adapter validates catalog and progress schemas and caps each input and composed response at 1 MiB. All fields are exact; IDs, field lengths, counts, enums, percentages and timestamps are bounded. The catalog is never derived from spool project rows. Missing/invalid catalog initially yields an empty unavailable catalog; after a validated read it retains that catalog in memory with state stale, including deletion. A valid empty catalog intentionally clears the list. Restart requires the private catalog to recover retained projects.

The browser retains last good private results on non-auth failures. Logout, 401 or 403 invalidates pending request generations and clears catalog, progress, selection and metadata. Keep runtime directories 0700 and private catalog/spools 0600; install runtime/config separately from source.
