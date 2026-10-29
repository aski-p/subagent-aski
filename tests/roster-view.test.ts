import test from "node:test";
import assert from "node:assert/strict";
import { partitionRoster, rosterProviderLabel } from "../lib/roster-view";
import { agentLabel } from "../app/components/role-avatar";
import type { AgentView } from "../lib/status-contract";
const base: AgentView = {id:"a",name:null,roleId:null,parentId:null,provider:null,model:null,projectId:null,currentTaskId:null,status:"unknown",lastActivityAt:null,lastSeenAt:null,source:"windows-codex"};
test("partition preserves order and uses only assignments", () => {
 const rows = [{...base,id:"provider",provider:"openai",model:"codex-auto-review"}, {...base,id:"role",roleId:"frame" as const}, {...base,id:"name",name:"Board"}, {...base,id:"project",projectId:"p"}, {...base,id:"task",currentTaskId:"t"}];
 const result = partitionRoster(rows);
 assert.deepEqual(result.assigned,[rows[1],rows[3],rows[4]]);
 assert.deepEqual(result.unassigned,[rows[0],rows[2]]);
 assert.equal(result.unassigned[0],rows[0]);
});
test("labels use authoritative role and observed provider", () => {
 assert.equal(agentLabel({...base,roleId:"frame"}),"Frame(UI/UX)");
 assert.equal(agentLabel({...base,roleId:"frame",name:"Custom"}),"Custom");
 assert.equal(agentLabel({...base,roleId:"frame",name:"Frame · one"}),"Frame(UI/UX) · one");
 assert.equal(agentLabel(base),"이름 확인 불가");
 assert.deepEqual(["openai","anthropic","qwen",null,"other"].map(rosterProviderLabel),["Codex","Claude","Qwen","제공자 미수집","other"]);
});
