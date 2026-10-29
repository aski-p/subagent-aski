"use client";
import { useEffect, useRef } from "react";
import { agentLabel } from "./role-avatar";
import type { AgentView, SnapshotV1 } from "@/lib/status-contract";
const time = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "확인 불가";
export function AgentDetail({
  agent,
  snapshot,
  onClose,
}: {
  agent: AgentView;
  snapshot: SnapshotV1;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        const nodes = close.current
          ?.closest('[role="dialog"]')
          ?.querySelectorAll<HTMLElement>(
            'button,a[href],[tabindex]:not([tabindex="-1"])',
          );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  const linked = snapshot.tasks.filter(
    (t) => t.assigneeIds.includes(agent.id) || t.id === agent.currentTaskId,
  );
  const ids = new Set(linked.map((t) => t.id));
  const parent = agent.parentId
    ? snapshot.agents.find((a) => a.id === agent.parentId)
    : null;
  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <header>
          <div>
            <p className="eyebrow">업무 상세</p>
            <h2 id="detail-title">{agentLabel(agent)}</h2>
          </div>
          <button ref={close} onClick={onClose}>
            닫기
          </button>
        </header>
        <dl>
          <div>
            <dt>제공자</dt>
            <dd>{agent.provider ?? "확인 불가"}</dd>
          </div>
          <div>
            <dt>모델</dt>
            <dd>{agent.model ?? "확인 불가"}</dd>
          </div>
          <div>
            <dt>확인된 상위 에이전트</dt>
            <dd>
              {agent.parentId ? (parent?.name != null ? agentLabel(parent) : agent.parentId) : "확인 불가"}
            </dd>
          </div>
          <div>
            <dt>출처</dt>
            <dd>{agent.source}</dd>
          </div>
          <div>
            <dt>마지막 업무</dt>
            <dd>{time(agent.lastActivityAt)}</dd>
          </div>
        </dl>
        <h3>연결된 작업</h3>
        {linked.length ? (
          linked.map((t) => (
            <p key={t.id}>
              {t.title ?? "제목 확인 불가"}{" "}
              <small>
                {t.status} · {time(t.updatedAt)}
              </small>
            </p>
          ))
        ) : (
          <p className="muted">확인된 작업이 없습니다.</p>
        )}
        <h3>최근 이벤트</h3>
        {snapshot.events
          .filter(
            (e) => e.agentId === agent.id || (!!e.taskId && ids.has(e.taskId)),
          )
          .map((e) => (
            <p key={e.id}>
              {e.publicSummary ?? e.type} <small>{time(e.occurredAt)}</small>
            </p>
          ))}
        <h3>결과물</h3>
        {snapshot.artifacts
          .filter((a) => a.taskId && ids.has(a.taskId))
          .map((a) => (
            <p key={a.id}>
              {a.safeUrl ? (
                <a href={a.safeUrl} target="_blank" rel="noreferrer">
                  {a.label ?? a.kind}
                </a>
              ) : (
                (a.label ?? a.kind)
              )}{" "}
              <small>{time(a.verifiedAt)}</small>
            </p>
          ))}
      </section>
    </div>
  );
}
