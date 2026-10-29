# Registered roster and unassigned session diagnostics fix

> For agentic workers: use superpowers:subagent-driven-development for this single task. Existing bug-fix/release authorization applies; no new design approval.

Goal: show registered agent identities in the main roster and retain unassigned discovery records in an explicit collapsed diagnostics section, without guessing names/roles/projects/tasks.
Architecture: preserve collectors and SnapshotV1. Partition already-filtered agents through one pure helper, render existing read-only selection callbacks, and fix canonical-role fallback for missing names. Root separately adds operator-reviewed mappings for proven native agents to the private Windows registry.
Tech: existing React/Next/TypeScript/tsx/Playwright; no dependency or new endpoint.
Spec: user screenshot of repeated unknown names plus original approved owner-only office design and scripts/agent-status/README.md registry-only identity policy.

## Global constraints
- Actual role/project/task labels come only from operator-reviewed registry. Never infer from model, nickname, prompt, cwd, provider, timestamp or lexical path.
- No unknown source record is deleted, relabeled as a six-role worker or falsely marked running. Historical actual Claude/Codex providers remain unchanged; Qwen migration is separate.
- Main owner roster accepts an agent if roleId OR projectId OR currentTaskId exists. Name alone (generic board status) is not a work assignment. Provider/model alone is not a work assignment.
- Use incoming project/provider filtered records, never global fallback. Private/public project collisions, generation guard, logout clearing, chat, office scene, percentages and existing source coverage stay intact.
- Unassigned records remain accessible in a collapsed native details section labeled 미등록 세션 N개; one concise explanation, no repeated four-field unknown walls. Each remains selectable through exact existing opaque ID and truthful detail.
- Mobile375px, long text wrapping, 44px interactive targets, keyboard disclosure/selection and pagination. Logout/unmount and filter remount clear private diagnostic state.
- One code implementer, exact task files, independent review before source/runtime release. Root owns private registry ops, no worker reads/copies salt/session IDs/transcripts or changes runtime.

## Review focus
1. Model codex-auto-review must not become Sentinel; provider-only records stay unassigned.
2. Registered name missing but role present must show the authoritative role label; a real custom name remains exact.
3. Filtering must precede partition, including empty private selection.
4. Disclosure/pagination cannot lose records, reveal hidden-filter records, or retain private records after logout.
5. Mixed known/unknown records and375px long names/models keep source data and keyboard navigation accessible.

### Task 1: Repair roster identity presentation and diagnostics — Frame Terra
Files: create lib/roster-view.ts, app/components/office-roster.tsx, tests/roster-view.test.ts, tests/office-roster.test.tsx. Modify app/components/office-dashboard.tsx, app/components/role-avatar.tsx, app/globals.css, tests/office-browser.mjs and existing role-label tests if their asserted missing-name fallback changes. No collector/progress/Qwen/sprite/composer/runtime edits.
Interfaces: partitionRoster(agents:AgentView[]):{assigned:AgentView[],unassigned:AgentView[]} preserves source order and objects. rosterProviderLabel(provider:string|null):string maps observed openai to Codex, anthropic to Claude, explicit qwen to Qwen; null is 제공자 미수집, other observed values stay literal. agentLabel fallback uses roles[roleId][0] when approved role is present and name missing; missing both remains truthful generic session wording. Preserve existing custom-name and role-name suffix behavior.
OfficeRoster consumes already filtered agents, current snapshot, parent visibleCount, onShowMore and onSelect(id). Parent retains selected detail and auth/generation. Main rows reuse avatars for real role IDs and existing status meanings. Unassigned rows use generic session/provider display, real observed model/time and existing exact-ID detail callback; omit repeated empty fields because group explanation covers them. Separate bounded unassigned pagination, native details initially collapsed, reset through filter key/unmount. Show assigned and unassigned counts honestly; main empty text explains no registered assignment without claiming no source records. Existing Snapshot task totals retain their current meanings.
- [ ] RED: pure tests prove all records retained exactly once/order, explicit role/project/task qualifies, name/provider/model alone does not, model cannot imply role, registered-null-name uses role, custom names and actual providers preserved. Render test checks collapsed diagnostic section, count/unknown wording and read-only callbacks without fabricated roles.
- [ ] Implement minimal pure partition and accessible roster component; replace only existing inline roster and its pagination. Keep parent filter/sort behavior, pass filter key, preserve detail flow and sources. No new data fetch/mutation.
- [ ] Actual dashboard browser: mixed registered+dozens unassigned yields clean primary roster and count disclosure; expand with keyboard, select exact record, close/focus return, paginate without data loss; filter/project/private collision and logout/inflight keep boundaries. Test missing registered name, long labels/models at375, no overflow, no POST. Keep previous office/chat/liveness regressions.
- [ ] Run focused tests first, then npm run verify and npm run test:office-browser against final built app; preserve exact RED/GREEN logs under this ignored workspace. Inspect desktop375 screenshots. Full report task-1-report.md with BASE/HEAD, files, commands/output, concerns. Commit exact task files, stop for root review; no push/deploy/subagents.

## Preflight and recovery
Existing linked feature worktree, BASE b08f593. Source source-of-truth is explicit registry; unknown flood is not lost transcript data. PGX64 records has4 names/roles, Claude32 has0, Windows54 has12 names/10 roles; exporter is using the expected private registry. Known recent native path assignments are missing in that registry; structural session metadata contains the exact agent_path, so no parser inference change is needed.
| Boundary | Ruling |
| Registry vs UI | Root registers only proven dispatch identities; UI never infers or writes mapping. |
| Parent vs component | Parent owns filter/auth/detail, component only read-only presentation and diagnostic pagination. |
| Existing tests | Preserve auth/collision/liveness; revise only assertions whose old unknown wall is the exact reported defect. |
Ruling: this is a correction to approved registry-only roster semantics, not a new role/progress/backend feature; execute within existing approval. Cost if wrong is reversible presentation/registry mapping rework.
