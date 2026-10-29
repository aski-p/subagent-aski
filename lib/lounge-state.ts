import type { RoleId } from './status-contract';
import type { PrivateProject, RunProgress, TaskProgress } from './progress-contract';
import type { ActivityProof, LoungeFilter, LoungeMode, LoungeRoleView } from './lounge-contract';
const roleIds:RoleId[]=['atlas','forge','frame','palette','scout','sentinel'];
const provider:Record<RoleId,'codex'|'claude'>={atlas:'codex',forge:'claude',frame:'codex',palette:'claude',scout:'claude',sentinel:'codex'};
const priority:Record<TaskProgress['state'],number>={working:0,qa:1,blocked:2,failed:2,queued:3,done:4,canceled:4};
const labels:Record<LoungeMode,string>={idle:'휴식 중',waiting:'대기 중',working:'작업 중',reviewing:'검토 중',blocked:'차단됨',failed:'실패',canceled:'취소됨',completed:'완료',unknown:'실행 확인 대기',stale:'상태 갱신 필요'};
export function selectLoungeRoles(input:{projects:PrivateProject[];publicProjectIds:string[];runs:RunProgress[];tasks:TaskProgress[];activityProofs:ActivityProof[];filter:LoungeFilter;selectedTaskIds:Partial<Record<RoleId,string>>;observedAt:string|null;fetchFailed:boolean;nowMs:number}):LoungeRoleView[]{
 const {projects,publicProjectIds,runs,tasks,activityProofs,filter,selectedTaskIds,observedAt,fetchFailed,nowMs}=input;
 const privateIds=new Set(projects.map(p=>p.id)), publicIds=new Set(publicProjectIds), runMap=new Map(runs.map(r=>[r.id,r]));
 const eligible=(r:RunProgress)=>{const f=filter.project; if(f.kind==='private')return privateIds.has(f.id)&&r.projectId===f.id; if(f.kind==='public')return publicIds.has(f.id)&&!privateIds.has(f.id)&&r.projectId===f.id; return privateIds.has(r.projectId)||publicIds.has(r.projectId)};
 const stale=fetchFailed||!observedAt||!Number.isFinite(Date.parse(observedAt))||nowMs-Date.parse(observedAt)>=90000||Date.parse(observedAt)>nowMs+5000;
 return roleIds.map(role=>{const scoped=tasks.filter(t=>t.role===role&&(!filter.provider||t.provider===filter.provider)&&!!runMap.get(t.runId)&&t.planVersion===runMap.get(t.runId)!.planVersion&&eligible(runMap.get(t.runId)!));const candidates=scoped.filter(t=>t.provider===provider[role]).sort((a,b)=>priority[a.state]-priority[b.state]||a.id.localeCompare(b.id));
 const task=candidates.find(t=>t.id===selectedTaskIds[role])??candidates[0]??null;
 if(!task){const collision=scoped.some(t=>t.provider!==provider[role]);return {role,mode:collision?'unknown':'idle',task:null,attemptId:null,verifiedPct:null,candidateTaskIds:[],statusLabel:collision?'배정 확인 필요':labels.idle,completionKey:null}};
 const attempt=[...task.attempts].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)||b.id.localeCompare(a.id))[0]??null;
 let mode:LoungeMode;
 if(stale)mode='stale';else if(task.state==='working'||task.state==='qa'){
 const eligibleAttempt=attempt&&!attempt.endedAt&&(attempt.state==='working'||attempt.state==='qa');
 const proof=eligibleAttempt?activityProofs.find(p=>{const confirmed=Date.parse(p.confirmedAt),expires=Date.parse(p.leaseExpiresAt);return p.taskId===task.id&&p.runId===task.runId&&p.attemptId===attempt.id&&p.planVersion===task.planVersion&&p.provider===task.provider&&p.source===(task.provider==='codex'?'codex-native':'claude-supervisor')&&(p.state==='running'||p.state==='reviewing')&&Number.isFinite(confirmed)&&Number.isFinite(expires)&&confirmed<=nowMs+5000&&nowMs-confirmed<=90000&&expires>nowMs&&expires<=confirmed+90000}):undefined;
 mode=proof?(proof.state==='reviewing'?'reviewing':'working'):'unknown';
 }else mode=({queued:'waiting',blocked:'blocked',failed:'failed',canceled:'canceled',done:'completed'} as const)[task.state];
 return {role,mode,task,attemptId:attempt?.id??null,verifiedPct:task.checkpoints.some(c=>c.weight>0)?task.verifiedPct:null,candidateTaskIds:candidates.map(t=>t.id),statusLabel:labels[mode],completionKey:mode==='completed'&&attempt?`${task.id}:${attempt.id}`:null};
 });
}
