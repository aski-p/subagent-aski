import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import OfficeDashboard from "../app/components/office-dashboard";
import {fetchOfficeSnapshot,OfficeFetchError} from "../lib/office-browser";

test("public initial view contains role guidance without private rows",()=>{
 const html=renderToStaticMarkup(React.createElement(OfficeDashboard));
 for(const name of ["Atlas","Forge","Frame","Palette","Scout","Sentinel"])assert.match(html,new RegExp(name));
 assert.match(html,/접근 권한 확인 중/);
 assert.doesNotMatch(html,/확인된 활동|마지막 업무|로그아웃/);
});
test("browser snapshot helper propagates auth and unavailable status",async()=>{
 const old=globalThis.fetch;
 try{for(const status of [401,403,503]){globalThis.fetch=async()=>new Response(null,{status});await assert.rejects(fetchOfficeSnapshot(),(e:unknown)=>e instanceof OfficeFetchError&&e.status===status)}
 }finally{globalThis.fetch=old}
});
