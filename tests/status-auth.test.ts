import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandshake, validateHandshake, signSession, readSession, requireOwner, logoutCookie, callbackOrigin } from "../lib/owner-auth";
const config={secret:"s".repeat(48),origins:["https://office.example"],clientId:"client"};
const now=Date.parse("2026-10-29T10:00:00Z");
test("OAuth handshake binds state/verifier, TTL and exact approved origin",()=>{
 const h=createHandshake(config,now); const v=validateHandshake(h.cookieValue,h.state,config,now);
 assert.equal(v.verifier,h.verifier); assert.equal(h.challenge.length,43);
 for(const state of [null,"wrong"]) assert.throws(()=>validateHandshake(h.cookieValue,state,config,now));
 assert.throws(()=>validateHandshake(null,h.state,config,now));
 assert.throws(()=>validateHandshake(h.cookieValue,h.state,config,now+600001));
 assert.throws(()=>validateHandshake(h.cookieValue+"x",h.state,config,now));
 assert.equal(callbackOrigin(new Request("https://office.example/api/auth/github"),config),"https://office.example");
 assert.throws(()=>callbackOrigin(new Request("https://evil.example/api/auth/github"),config));
});
test("signed identity distinguishes owner, other user, tamper, expiry and forged headers",()=>{
 const owner=signSession(69686315,config.secret,now);
 assert.equal(readSession(owner,config.secret,now)?.githubId,69686315);
 assert.equal(requireOwner({githubId:69686316}),403);assert.equal(requireOwner(null),401);
 assert.equal(requireOwner({githubId:69686315}),200);
 assert.equal(readSession(owner+"x",config.secret,now),null);
 assert.equal(readSession(owner,config.secret,now+86400001),null);
 assert.equal(readSession(signSession(69686315,config.secret,now+61000),config.secret,now),null);
 assert.match(logoutCookie(),/Max-Age=0/);
 assert.equal(readSession(new Request("https://office.example",{headers:{"oai-authenticated-user-email":"owner"}}).headers.get("cookie"),config.secret,now),null);
});

test("private API denies before upstream, sanitizes failures, OAuth code replay and wrong verifier fail",async()=>{
 process.env.JWT_SECRET=config.secret;process.env.AUTH_ALLOWED_ORIGINS=config.origins[0];process.env.GITHUB_CLIENT_ID="client";process.env.GITHUB_CLIENT_SECRET="test-secret";
 const {GET:snapshot}=await import("../app/api/office/snapshot/route");const {GET:callback}=await import("../app/api/auth/github/callback/route");const {GET:login}=await import("../app/api/auth/github/route");const {POST:logout}=await import("../app/api/auth/logout/route");
 const original=globalThis.fetch;let calls=0;let consumed=false;let expectedVerifier="";
 globalThis.fetch=(async(input,init)=>{calls++;if(String(input).includes("access_token")){const body=JSON.parse(String(init?.body));if(consumed||body.code_verifier!==expectedVerifier)return Response.json({error:"bad_verification_code"});consumed=true;return Response.json({access_token:"NEVER_EXPOSE_TOKEN"});}return Response.json({id:69686315});}) as typeof fetch;
 try {
 for(const [request,status] of [[new Request("https://office.example/api/office/snapshot",{headers:{"oai-authenticated-user-email":"owner"}}),401],[new Request("https://office.example/api/office/snapshot",{headers:{cookie:`__Host-office_session=${signSession(69686316,config.secret)}`}}),403]] as const){const response=await snapshot(request);assert.equal(response.status,status);assert.match(response.headers.get("cache-control")!,/no-store/);}
 assert.equal(calls,0);
 const denied=await login(new Request("https://office.example/api/auth/github?returnTo=https://evil.example"));assert.equal(denied.status,400);
 const h=createHandshake(config);expectedVerifier="wrong";
 const req=()=>new Request(`https://office.example/api/auth/github/callback?state=${h.state}&code=single-use`,{headers:{cookie:`__Host-office_oauth=${h.cookieValue}`}});
 assert.equal((await callback(req())).status,400);expectedVerifier=h.verifier;
 const success=await callback(req());assert.equal(success.status,302);assert.match(success.headers.get("set-cookie")!,/__Host-office_oauth=;.*Max-Age=0/);assert.ok(!JSON.stringify([...success.headers]).includes("NEVER_EXPOSE_TOKEN"));
 assert.equal((await callback(req())).status,400);
 assert.equal((await callback(new Request(`https://office.example/api/auth/github/callback?state=${h.state}&code=single-use`))).status,400);
 const out=await logout(new Request("https://office.example/api/auth/logout",{method:"POST",headers:{origin:"https://office.example"}}));assert.equal(out.status,200);assert.match(out.headers.get("set-cookie")!,/Max-Age=0/);
 delete process.env.STATUS_ADAPTER_URL;const unavailable=await snapshot(new Request("https://office.example/api/office/snapshot",{headers:{cookie:`__Host-office_session=${signSession(69686315,config.secret)}`}}));assert.equal(unavailable.status,503);assert.deepEqual(Object.keys(await unavailable.json()).sort(),["checkedAt","error"]);
 }finally{globalThis.fetch=original;}
});
