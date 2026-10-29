import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentLounge } from '../app/components/agent-lounge';
test('room exposes status, criteria, pause and decorative avatars',()=>{const html=renderToStaticMarkup(<AgentLounge roles={[{role:'frame',mode:'unknown',task:null,attemptId:null,verifiedPct:null,candidateTaskIds:[],statusLabel:'실행 확인 대기',completionKey:null}]} motionPaused={false} onMotionPausedChange={()=>{}} onSelectTask={()=>{}} onOpenTask={()=>{}}/>);for(const text of ['Frame(UI/UX)','실행 확인 대기','— / 기준 없음','aria-hidden','aria-pressed="false"'])assert.ok(html.includes(text),text)});
