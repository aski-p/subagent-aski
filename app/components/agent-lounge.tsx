'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { RoleId } from '../../lib/status-contract';
import type { LoungeRoleView } from '../../lib/lounge-contract';
import { roles as roleLabels } from './role-avatar';
import { LoungeAvatar } from './lounge-avatar';

export function AgentLounge({ roles, motionPaused, onMotionPausedChange, onSelectTask, onOpenTask }: {
  roles: LoungeRoleView[];
  motionPaused: boolean;
  onMotionPausedChange: (v: boolean) => void;
  onSelectTask: (role: RoleId, taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const [celebrating, setCelebrating] = useState<string[]>([]);
  const previous = useRef<Map<RoleId, {taskId:string|null; attemptId:string|null; mode:string}> | null>(null);
  const completedHistory = useRef(new Map<string, true>());

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const before = previous.current;
    const next = new Map(roles.map(r => [r.role, {taskId:r.task?.id ?? null, attemptId:r.attemptId, mode:r.mode}]));
    const keys: string[] = [];
    for (const r of roles) {
      if (!r.completionKey) continue;
      const key = `${r.role}:${r.completionKey}`;
      const p = before?.get(r.role);
      if (!completedHistory.current.has(key) && p && p.taskId === r.task?.id &&
          p.attemptId === r.attemptId && (p.mode === 'working' || p.mode === 'reviewing')) keys.push(r.completionKey);
      completedHistory.current.delete(key);
      completedHistory.current.set(key, true);
      if (completedHistory.current.size > 256) completedHistory.current.delete(completedHistory.current.keys().next().value!);
    }
    previous.current = next;
    if (keys.length) {
      const timer = setTimeout(() => setCelebrating(keys), 0);
      return () => clearTimeout(timer);
    }
  }, [roles]);
  useEffect(() => {
    if (!celebrating.length) return;
    const timer = setTimeout(() => setCelebrating([]), 2000);
    return () => clearTimeout(timer);
  }, [celebrating]);

  return (
    <section className={`agent-lounge${motionPaused || hidden ? ' is-paused' : ''}`} aria-label="에이전트 라운지">
      <header className="lounge-header">
        <div><h2>에이전트 오피스</h2><p>업무 없는 역할은 휴식 캐릭터로 표시돼요. 실제 실행은 확인된 업무로 표시합니다.</p></div>
        <button type="button" aria-pressed={motionPaused} onClick={() => onMotionPausedChange(!motionPaused)}>
          {motionPaused ? '움직임 재개' : '움직임 일시정지'}
        </button>
      </header>
      <div className="lounge-room">
        <div className="lounge-floor" aria-hidden="true"/>
        <div className="lounge-furniture" aria-hidden="true">
          <div className="lounge-window"/><div className="lounge-shelf"/><div className="lounge-sofa"/>
          <div className="lounge-table"/><div className="lounge-plant"/><div className="lounge-rug"/><div className="lounge-meeting"/>
        </div>
        <div className="lounge-roles">
          {roles.map(r => (
            <article className={`lounge-role${r.completionKey && celebrating.includes(r.completionKey) ? ' is-celebrating' : ''}`}
              key={r.role} style={{color:roleLabels[r.role][2]}}>
              <div className="lounge-name">{roleLabels[r.role][0]}</div>
              {r.mode !== 'idle' && <div className="lounge-stat">{r.verifiedPct === null ? '— / 기준 없음' : `${r.verifiedPct}%`}</div>}
              <div className="lounge-lane">
                <div className="lounge-desk" aria-hidden="true"><span className="lounge-monitor"/><span className="lounge-chair"/></div>
                <LoungeAvatar role={r.role} mode={r.mode} paused={motionPaused || hidden}/>
              </div>
              <div className="lounge-status">{r.task ? r.statusLabel : r.mode === 'idle' ? '휴식' : r.statusLabel}</div>
            </article>
          ))}
        </div>
      </div>
      {roles.some(r => r.task) && <div className="lounge-inspector" aria-label="역할별 업무">
        {roles.filter(r => r.task).map(r => <div className="lounge-inspector-row" key={r.role}>
          <div><strong>{roleLabels[r.role][0]}</strong> · {r.task!.id} · {r.task!.provider} / {r.task!.observedModel ?? r.task!.requestedModel ?? '모델 미확인'}</div>
          <label className="lounge-select">작업 선택 <select value={r.task!.id} onChange={e => onSelectTask(r.role, e.target.value)}>
            {r.candidateTaskIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select></label>
          <button className="lounge-open" type="button" onClick={() => onOpenTask(r.task!.id)}>작업 보기</button>
        </div>)}
      </div>}
      <details className="lounge-preview">
        <summary>연출 미리보기 · 실제 업무 아님</summary>
        <p>확인된 실행과 관계없는 움직임 예시입니다.</p>
        <div className="lounge-preview-figures">
          <LoungeAvatar role="frame" mode="working" paused={motionPaused || hidden}/>
          <LoungeAvatar role="scout" mode="reviewing" paused={motionPaused || hidden}/>
        </div>
      </details>
    </section>
  );
}
