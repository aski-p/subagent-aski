import type {CommandReceipt} from "@/lib/command-contract";
const labels:Record<CommandReceipt["state"],string>={accepted:"접수됨",claimed:"전달 대기",queued:"전달 대기",received:"Boss가 받음",started:"작업 시작",retry_wait:"다시 전달 대기",failed:"처리 실패",uncertain:"처리 여부 확인 필요",expired:"기한 만료",handled:"처리됨",awaiting_input:"답변 기다리는 중",closed:"대화 종료"};
export function CommandReceipts({receipts,originals,onReply}:{receipts:CommandReceipt[];originals:Record<string,string>;onReply:(id:string)=>void}){
 return <div className="boss-history" aria-live="polite" aria-label="Boss 대화 기록">
 {receipts.length===0?<p className="boss-empty">Boss에게 질문하거나 부탁할 일을 적어 주세요.</p>:receipts.map(r=>{
 const child=receipts.some(c=>c.replyToCommandId===r.id&&!["expired","failed","closed"].includes(c.state));
 return <article className="boss-message" key={r.id} id={"command-"+r.id}>
 <div className="boss-message-head"><strong>{r.summary==="Owner command"?"보낸 요청":r.summary}</strong><span>{labels[r.state]}</span></div>
 {originals[r.id]&&<details><summary>보낸 내용 보기</summary><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{originals[r.id]}</p></details>}
 {r.replySummary&&<p className="boss-answer"><strong>Boss</strong><br/>{r.replySummary}</p>}
 {r.state==="awaiting_input"&&!child&&<button type="button" className="boss-reply" onClick={()=>onReply(r.id)}>이어 답변</button>}
 </article>})}</div>
}
