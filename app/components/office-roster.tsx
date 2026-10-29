"use client";
import { useState } from "react";
import type { AgentView, SnapshotV1 } from "@/lib/status-contract";
import { partitionRoster, rosterProviderLabel } from "@/lib/roster-view";
import { Avatar, roles, agentLabel } from "./role-avatar";

const time = (value: string | null) => value
  ? new Date(value).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
  : "확인 불가";
const statusLabels = {
  working: "작업 시작 기록",
  completed: "완료 기록",
  blocked: "차단됨",
  idle: "대기 기록",
  unknown: "확인 불가",
};

type Props = {
  agents: AgentView[];
  snapshot: SnapshotV1 | null;
  visibleCount: number;
  onShowMore: () => void;
  onSelect: (id: string) => void;
};

export function OfficeRoster({ agents, snapshot, visibleCount, onShowMore, onSelect }: Props) {
  const [diagnosticCount, setDiagnosticCount] = useState(20);
  const { assigned, unassigned } = partitionRoster(agents);
  return (
    <>
      <p className="roster-count">등록된 배정 {assigned.length}개</p>
      <div className="roster">
        <div className="roster-heading">
          <span>에이전트 / 역할</span>
          <span>제공자 / 모델</span>
          <span>마지막 업무</span>
          <span>상태</span>
        </div>
        {assigned.length ? assigned.slice(0, visibleCount).map((agent) => {
          const metadata = [
            agent.roleId ? roles[agent.roleId][0] : null,
            agent.projectId,
            agent.currentTaskId
              ? `작업: ${snapshot?.tasks.find((task) => task.id === agent.currentTaskId)?.title ?? agent.currentTaskId}`
              : null,
          ].filter(Boolean);
          const initial = (agent.name?.trim() || agent.provider?.trim() || "·").slice(0, 1).toUpperCase();
          return (
            <button type="button" className="roster-row" key={agent.id} onClick={() => onSelect(agent.id)}>
              <span className="person">
                {agent.roleId ? <Avatar role={agent.roleId} /> : <span className="unknown" aria-hidden="true">{initial}</span>}
                <span>
                  <strong>{agentLabel(agent)}</strong>
                  <small>{metadata.length ? metadata.join(" · ") : "등록된 업무 정보 없음"}</small>
                </span>
              </span>
              <span>
                {rosterProviderLabel(agent.provider)}
                <small>{agent.model ?? "모델 미수집"}</small>
              </span>
              <span>{time(agent.lastActivityAt)}</span>
              <span className="status">{statusLabels[agent.status]}</span>
            </button>
          );
        }) : (
          <div className="empty">{snapshot ? "조건에 맞는 등록된 배정이 없습니다." : "업무 기록을 기다리고 있습니다."}</div>
        )}
      </div>
      {visibleCount < assigned.length && (
        <button type="button" className="more" onClick={onShowMore}>더 보기 ({visibleCount} / {assigned.length})</button>
      )}
      {unassigned.length > 0 && (
        <details className="roster-diagnostics">
          <summary>미등록 세션 {unassigned.length}개</summary>
          <p>역할, 프로젝트 또는 작업에 등록되지 않은 수집 기록입니다. 각 항목에서 확인된 상세 정보를 볼 수 있습니다.</p>
          <div className="diagnostic-list">
            {unassigned.slice(0, diagnosticCount).map((agent) => (
              <button type="button" className="diagnostic-row" key={agent.id} onClick={() => onSelect(agent.id)}>
                <span>
                  <strong>미등록 세션{agent.name ? ` · ${agent.name}` : ""} · {rosterProviderLabel(agent.provider)}</strong>
                  <small>{agent.model ?? "모델 미수집"}</small>
                </span>
                <span>마지막 활동 {time(agent.lastActivityAt ?? agent.lastSeenAt)}</span>
              </button>
            ))}
          </div>
          {diagnosticCount < unassigned.length && (
            <button type="button" className="more" onClick={() => setDiagnosticCount((n) => n + 20)}>
              미등록 세션 더 보기 ({diagnosticCount} / {unassigned.length})
            </button>
          )}
        </details>
      )}
    </>
  );
}
