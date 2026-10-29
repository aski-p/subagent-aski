import React from 'react';
import type { RoleId } from '../../lib/status-contract';
import type { LoungeMode } from '../../lib/lounge-contract';
import { Avatar } from './role-avatar';
export function LoungeAvatar({role,mode,paused}:{role:RoleId;mode:LoungeMode;paused:boolean}){
 return <div className={`lounge-avatar lounge-avatar--${mode}${paused?' is-paused':''}`} aria-hidden="true"><div className="lounge-robot"><Avatar role={role}/><svg className="lounge-body" viewBox="0 0 80 70"><path d="M24 5 Q40 -1 56 5 L60 42 Q40 52 20 42Z" fill="#f3f0ea" stroke="currentColor" strokeWidth="3"/><path className="lounge-arm left" d="M23 13 L9 30 L21 35 M57 13 L71 30 L59 35" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><path d="M28 45 L25 62 M52 45 L55 62" stroke="currentColor" strokeWidth="7" strokeLinecap="round"/></svg></div>{mode==='working'?<><span className="lounge-desk"/><span className="lounge-screen"/><span className="lounge-sweat">◉</span></>:<span className="lounge-seat"/>}</div>;
}
