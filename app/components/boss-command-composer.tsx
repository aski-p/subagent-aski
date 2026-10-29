"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CommandFetchError,fetchCommandContext,sendBossCommand} from "@/lib/command-browser";
import type {CommandContext,CommandInput} from "@/lib/command-contract";
import type {PrivateProject} from "@/lib/progress-contract";
import {CommandReceipts} from "./command-receipts";

export function BossCommandComposer({projects,onAuthFailure}:{projects:PrivateProject[];onAuthFailure:()=>void}){
 const [context,setContext]=useState<CommandContext|null>(null);
 const [draft,setDraft]=useState("");const [project,setProject]=useState<string|null>(null);const [reply,setReply]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [retryAt,setRetryAt]=useState(0);const [clock,setClock]=useState(0);
 const [frozen,setFrozen]=useState<CommandInput|null>(null);const [unknown,setUnknown]=useState(false);const [existing,setExisting]=useState<string|null>(null);
 const generation=useRef(0);const lock=useRef(false);const composing=useRef(false);const input=useRef<HTMLTextAreaElement>(null);
 const refresh=useCallback(async()=>{const g=generation.current;try{const c=await fetchCommandContext();if(g===generation.current)setContext(c)}catch(e){if(g!==generation.current)return;if(e instanceof CommandFetchError&&(e.status===401||e.status===403)){generation.current++;onAuthFailure()}else setMessage("대화 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")}},[onAuthFailure]);
 useEffect(()=>{const guard=generation;const first=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),15000);return()=>{guard.current++;clearTimeout(first);clearInterval(timer)}},[refresh]);
 useEffect(()=>{if(!retryAt)return;const t=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(t)},[retryAt]);
 const remaining=Math.max(0,Math.ceil((retryAt-clock)/1000));
 const findExisting=async(id:string)=>{
  const g=generation.current;let cursor=context?.nextCursor??null;let found=context?.receipts.some(r=>r.id===id)??false;
  const visited=new Set<string>();const collected:CommandContext["receipts"]=[];
  try{
   while(!found&&cursor&&visited.size<20){
    if(visited.has(cursor))break;visited.add(cursor);
    const page=await fetchCommandContext(undefined,cursor);if(g!==generation.current)return;
    collected.push(...page.receipts);found=page.receipts.some(r=>r.id===id);cursor=page.nextCursor;
   }
   if(g!==generation.current)return;
   setContext(c=>{if(!c)return c;const ids=new Set(c.receipts.map(r=>r.id));const added=collected.filter(r=>{if(ids.has(r.id))return false;ids.add(r.id);return true});return {...c,nextCursor:cursor,receipts:[...c.receipts,...added]}});
   if(found)setTimeout(()=>{if(g===generation.current)document.getElementById("command-"+id)?.scrollIntoView({block:"nearest"})},0);
   else setMessage("기존 요청을 찾지 못했습니다. 기록을 새로고침해 주세요.");
  }catch(e){if(g!==generation.current)return;if(e instanceof CommandFetchError&&(e.status===401||e.status===403)){generation.current++;onAuthFailure()}else setMessage("기존 기록을 불러오지 못했습니다. 다시 시도해 주세요.")}
 };
 const submit=async()=>{
  if(lock.current||busy||!context||remaining>0)return;
  if(reply&&(!context.receipts.some(r=>r.id===reply&&r.state==="awaiting_input")||context.receipts.some(r=>r.replyToCommandId===reply&&!["expired","failed","closed"].includes(r.state)))){setMessage("이 질문에는 이미 답변했거나 답변 기간이 끝났습니다.");return}
  const trimmed=draft.trim();if(!trimmed||[...trimmed].length>4000){setMessage("1~4000자로 입력해 주세요.");return}
  const same=frozen&&frozen.text===trimmed&&frozen.projectId===project&&(frozen.replyToCommandId??null)===reply;
  if(unknown&&!same){setMessage("먼저 이전 요청의 접수 여부를 확인해 주세요.");return}
  const payload:CommandInput=same?frozen:{schemaVersion:1,clientRequestId:crypto.randomUUID(),projectId:project,text:trimmed,...(reply?{replyToCommandId:reply}:{})};
  setFrozen(payload);lock.current=true;setBusy(true);setMessage("");setExisting(null);const g=generation.current;
  try{const receipt=await sendBossCommand(payload,context.csrfToken);if(g!==generation.current)return;
   setContext(c=>c?{...c,receipts:[receipt,...c.receipts.filter(r=>r.id!==receipt.id)]}:c);setDraft("");setReply(null);setFrozen(null);setUnknown(false);setMessage("요청이 접수되었습니다.");void refresh();
  }catch(e){if(g!==generation.current)return;
   if(e instanceof CommandFetchError){
    if(e.status===403&&e.code==="csrf_expired"){setMessage("다시 확인한 뒤 같은 요청을 보내 주세요.");await refresh()}
    else if(e.status===401||e.status===403){generation.current++;onAuthFailure()}
    else if(e.status===503&&e.outcomeUnknown){setUnknown(true);setMessage("접수 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.")}
    else if(e.status===409&&e.code==="equivalent_pending"){setFrozen(null);setUnknown(false);setMessage("같은 요청이 이미 대기 중입니다. 기존 기록을 확인해 주세요.");setExisting(e.existingReceiptId);await refresh()}
    else if(e.status===410){setFrozen(null);setUnknown(false);setMessage("이 요청의 기록이 만료되었습니다. 내용을 확인한 뒤 새 요청으로 보내 주세요.")}
    else if(e.status===429&&e.retryAfter){setRetryAt(Date.now()+e.retryAfter*1000);setClock(Date.now());setMessage("요청이 많습니다. 잠시 후 다시 시도해 주세요.")}
    else setMessage(e.code==="commands_disabled"?"지금은 Boss 대화를 사용할 수 없습니다.":"요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
   }else{setUnknown(true);setMessage("접수 여부를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.")}
  }finally{if(g===generation.current){lock.current=false;setBusy(false)}}
 };
 return <section className="boss-chat" aria-labelledby="boss-title">
  <div className="boss-chat-head"><span className="boss-face" aria-hidden="true">👑🙂</span><div><h2 id="boss-title">Boss(총괄)</h2><p>질문과 요청을 남기고 답변을 확인하세요.</p></div><button className="boss-refresh" type="button" onClick={()=>void refresh()}>기록 새로고침</button></div>
  <CommandReceipts receipts={context?.receipts??[]} onReply={id=>{if(!busy&&!unknown){setReply(id);input.current?.focus()}}}/>
  {context?.nextCursor&&<button className="boss-refresh" type="button" onClick={async()=>{const g=generation.current;try{const page=await fetchCommandContext(undefined,context.nextCursor!);if(g===generation.current)setContext(c=>c?{...c,nextCursor:page.nextCursor,receipts:[...c.receipts,...page.receipts.filter(r=>!c.receipts.some(old=>old.id===r.id))]}:c)}catch(e){if(g!==generation.current)return;if(e instanceof CommandFetchError&&(e.status===401||e.status===403)){generation.current++;onAuthFailure()}else setMessage("이전 기록을 불러오지 못했습니다.")}}}>이전 기록 더 보기</button>}
  <div className="boss-compose-meta"><label>대상 프로젝트 <select value={project??""} disabled={unknown||busy} onChange={e=>setProject(e.target.value||null)}><option value="">현재 Boss</option>{projects.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>{reply&&<span>이어 답변 중 <button type="button" disabled={unknown||busy} onClick={()=>setReply(null)}>취소</button></span>}</div>
  <div className="boss-compose"><textarea ref={input} aria-label="Boss에게 보낼 내용" placeholder="질문이나 요청을 입력하세요" value={draft} disabled={unknown||busy} maxLength={8000} onChange={e=>setDraft(e.target.value)} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&!composing.current&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();void submit()}}}/><button type="button" className="boss-send" aria-label={unknown?"같은 요청으로 확인":"요청 보내기"} disabled={busy||!context||remaining>0||!draft.trim()} onClick={()=>void submit()}>{busy?"…":"↑"}</button></div>
  <div className="boss-hint"><span>Enter 줄바꿈 · Ctrl / ⌘ + Enter 보내기</span><span>{[...draft].length} / 4000</span></div>
  <p className="boss-status" role="status">{remaining?retryAt&&`${remaining}초 후 다시 시도할 수 있습니다.`:message}{existing&&<> <a href={"#command-"+existing} onClick={e=>{e.preventDefault();void findExisting(existing)}}>기존 요청 보기</a></>}</p>
 </section>;
}
