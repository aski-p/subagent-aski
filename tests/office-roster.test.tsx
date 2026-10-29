import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {OfficeRoster} from "../app/components/office-roster";
import type {AgentView} from "../lib/status-contract";
const base:AgentView={id:"opaque",name:null,roleId:null,parentId:null,provider:"openai",model:"codex-auto-review",projectId:null,currentTaskId:null,status:"unknown",lastActivityAt:null,lastSeenAt:null,source:"windows-codex"};
test("unassigned sessions are collapsed, truthful, and selectable",()=>{
 const html=renderToStaticMarkup(<OfficeRoster agents={[base]} snapshot={null} visibleCount={20} onShowMore={()=>{}} onSelect={()=>{}}/>);
 assert.match(html,/<details/); assert.doesNotMatch(html,/<details[^>]* open/);
 assert.match(html,/미등록 세션 1개/); assert.match(html,/Codex/); assert.match(html,/codex-auto-review/);
 assert.doesNotMatch(html,/Sentinel|역할 확인 불가|프로젝트 확인 불가/);
 assert.match(html,/<button/);
});

test("assigned metadata is concise and approved diagnostic names remain visible",()=>{
 const project = {...base,id:"project",name:"Boss",projectId:"alpha"};
 const role = {...base,id:"role",roleId:"frame" as const};
 const diagnostic = {...base,id:"named",name:"Approved name"};
 const html=renderToStaticMarkup(<OfficeRoster agents={[project,role,diagnostic]} snapshot={null} visibleCount={20} onShowMore={()=>{}} onSelect={()=>{}}/>);
 assert.match(html,/Boss/); assert.match(html,/alpha/); assert.match(html,/Frame\(UI\/UX\)/);
 assert.match(html,/Approved name/);
 assert.doesNotMatch(html,/역할 확인 불가|프로젝트 확인 불가|작업: 확인 불가/);
 assert.doesNotMatch(html,/<span class="unknown">\?<\/span>/);
});

test("valid inherited-property provider renders as literal diagnostic text",()=>{
 const html=renderToStaticMarkup(<OfficeRoster agents={[{...base,provider:"__proto__"}]} snapshot={null} visibleCount={20} onShowMore={()=>{}} onSelect={()=>{}}/>);
 assert.match(html,/__proto__/);
});
