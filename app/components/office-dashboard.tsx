"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOfficeSnapshot, fetchOfficeProgress, OfficeFetchError } from "@/lib/office-browser";
import { Avatar, roles, agentLabel } from "./role-avatar";
import { AgentDetail } from "./agent-detail";
import { BossCommandComposer } from "./boss-command-composer";
import { SourceCoverageView } from "./source-coverage";
import { usePublicEvidence } from "./public-evidence";
import type { SnapshotV1 } from "@/lib/status-contract";
import type { ProgressV1 } from "@/lib/progress-contract";
import { ROLES } from "@/lib/status-contract";

const time = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "확인 불가";
export default function OfficeDashboard() {
  const [auth, setAuth] = useState<"loading" | "out" | "owner">("loading");
  const [snapshot, setSnapshot] = useState<SnapshotV1 | null>(null);
  const [project, setProject] = useState("");
  const [progress, setProgress] = useState<ProgressV1 | null>(null);
  const selection = project.startsWith("private:")
    ? {kind:"private" as const,id:project.slice("private:".length)}
    : {kind:"legacy" as const,id:project};
  const privateSelection = selection.kind === "private";
  const privateProject = privateSelection ? progress?.projects.find((p) => p.id === selection.id) : undefined;
  const [stale, setStale] = useState(false);
  const [provider, setProvider] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const {
    projects,
    publicProject,
    runs,
    projectsError,
    runsError,
    projectsChecked,
    runsChecked,
  } = usePublicEvidence(privateSelection ? "" : project);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const guard = generation;
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => {
        if (live) setAuth(x.authenticated && x.owner ? "owner" : "out");
      })
      .catch(() => {
        if (live) setAuth("out");
      });
    return () => {
      live = false;
      guard.current++;
      active.current?.abort();
    };
  }, []);
  const clearPrivate = useCallback(() => {
    generation.current++;
    active.current?.abort();
    setSnapshot(null);
    setProgress(null);
    setSelected(null);
    setProject("");
    setProvider("");
    setVisibleCount(20);
    setStale(false);
    setAuth("out");
  }, []);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const privateRequest = async <T,>(request: Promise<T>): Promise<T> => {
      try { return await request; } catch (error) {
        if (id === generation.current && !controller.signal.aborted && error instanceof OfficeFetchError && (error.status === 401 || error.status === 403)) clearPrivate();
        throw error;
      }
    };
    try {
      const results = await Promise.allSettled([
        privateRequest(fetchOfficeSnapshot(controller.signal)),
        privateRequest(fetchOfficeProgress(controller.signal)),
      ]);
      if (id !== generation.current || controller.signal.aborted) return;
      if (results.some((r) => r.status === "rejected" && r.reason instanceof OfficeFetchError && (r.reason.status === 401 || r.reason.status === 403))) {
        clearPrivate();
        return;
      }
      const [snapshotResult, progressResult] = results;
      if (snapshotResult.status === "fulfilled") setSnapshot(snapshotResult.value);
      if (progressResult.status === "fulfilled") setProgress(progressResult.value);
      setStale(results.some((r) => r.status === "rejected"));
    } catch (error) {
      if (id !== generation.current || controller.signal.aborted) return;
      if (
        error instanceof OfficeFetchError &&
        (error.status === 401 || error.status === 403)
      ) {
        clearPrivate();
      } else setStale(true);
    }
  }, [clearPrivate]);
  useEffect(() => {
    if (auth !== "owner") return;
    const guard = generation;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      guard.current++;
      active.current?.abort();
    };
  }, [auth, project, refresh]);
  const logout = async () => {
    clearPrivate();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  };
  const agent = snapshot?.agents.find((a) => a.id === selected);
  const filtered =
    snapshot?.agents
      .filter(
        (a) =>
          !privateSelection && (!selection.id || a.projectId === selection.id) &&
          (!provider || a.provider === provider),
      )
      .sort((a, b) => {
        const timestamp = (item: typeof a) =>
          Date.parse(item.lastActivityAt ?? item.lastSeenAt ?? "1970-01-01");
        const rank = (item: typeof a) =>
          snapshot &&
          Date.parse(snapshot.observedAt) - timestamp(item) < 86400000 &&
          item.currentTaskId &&
          snapshot.tasks.some((t) => t.id === item.currentTaskId && t.title)
            ? 1
            : 0;
        return rank(b) - rank(a) || timestamp(b) - timestamp(a);
      }) ?? [];
  const tasks =
    snapshot?.tasks.filter((t) => !privateSelection && (!selection.id || t.projectId === selection.id)) ?? [];
  return (
    <main>
      <header className="top">
        <span className="brand">
          <span>✳</span> ASKI <b>office</b>
        </span>
        <nav>
          <a href="https://askiworld.vercel.app/">Aski hub</a>
          {auth === "owner" ? (
            <button onClick={logout}>로그아웃</button>
          ) : (
            <a className="login" href="/api/auth/github">
              GitHub 로그인
            </a>
          )}
        </nav>
      </header>
      <div className="shell">
        {auth !== "owner" && (
          <>
            <section className="intro">
              <div>
                <p className="eyebrow">ASKI의 작업 공간</p>
                <h1>
                  일의 흐름을
                  <br />
                  <em>한눈에.</em>
                </h1>
                <p>역할과 실제 업무 기록을 함께 살펴보세요.</p>
              </div>
              <div className="intro-note">
                <strong>읽기 전용 업무 명부</strong>
                <p>
                  역할은 팀의 구성입니다. 실제 활동은 확인된 기록으로
                  표시합니다.
                </p>
              </div>
            </section>
            <section className="roles">
              <div className="section-head">
                <div>
                  <p className="eyebrow">팀의 역할</p>
                  <h2>여섯 가지 관점</h2>
                </div>
                <p>역할 이름과 제공자·모델은 별개입니다.</p>
              </div>
              <div className="role-strip">
                {ROLES.map((r) => (
                  <div className="role" key={r}>
                    <Avatar role={r} />
                    <strong>{roles[r][0]}</strong>
                    <span>{roles[r][1]}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {auth !== "owner" ? (
          <section className="signin">
            <div>
              <p className="eyebrow">비공개 업무</p>
              <h2>
                {auth === "loading"
                  ? "접근 권한 확인 중"
                  : "내 팀의 업무를 확인하세요"}
              </h2>
              <p>
                소유자로 로그인하면 실제 에이전트와 작업 기록을 볼 수 있습니다.
              </p>
            </div>
            {auth !== "loading" && (
              <a className="primary" href="/api/auth/github">
                GitHub로 로그인
              </a>
            )}
          </section>
        ) : (
          <>
            <BossCommandComposer projects={progress?.projects ?? []} onAuthFailure={clearPrivate} />
            <section className="workspace">
              <div className="section-head">
                <div>
                  <p className="eyebrow">
                    마지막 확인 기록 · {time(snapshot?.observedAt)}
                  </p>
                  <h2>작업 현황</h2>
                </div>
                <p>마지막 관측 상태이며 현재 실행을 보장하지 않습니다.</p>
              </div>
              <div className="overview">
                <span>
                  전체 작업 <strong>{snapshot?.tasks.length ?? "—"}</strong>
                </span>
                <span>
                  작업 기록{" "}
                  <strong>
                    {snapshot?.tasks.filter((t) => t.status === "working")
                      .length ?? "—"}
                  </strong>
                </span>
                <span>
                  검증{" "}
                  <strong>
                    {snapshot?.tasks.filter((t) => t.status === "qa").length ??
                      "—"}
                  </strong>
                </span>
                <span>
                  확인 필요{" "}
                  <strong>
                    {snapshot?.tasks.filter((t) => t.status === "blocked")
                      .length ?? "—"}
                  </strong>
                </span>
              </div>
              <div className="filters">
                <label>
                  프로젝트{" "}
                  <select
                    value={project}
                    onChange={(e) => {
                      generation.current++;
                      active.current?.abort();
                      setProject(e.target.value);
                      setVisibleCount(20);
                      setSelected(null);
                    }}
                  >
                    <option value="">전체 프로젝트</option>
                    {progress?.projects.map((p) => (
                      <option key={"private:" + p.id} value={"private:" + p.id}>{p.label} · 비공개 등록</option>
                    ))}
                    {Array.from(
                      new Set(
                        [
                          ...(snapshot?.agents.map((a) => a.projectId) ?? []),
                          ...(snapshot?.tasks.map((t) => t.projectId) ?? []),
                          ...projects.map((p) => p.name),
                        ].filter((x): x is string => !!x),
                      ),
                    ).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  제공자{" "}
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value);
                      setVisibleCount(20);
                    }}
                  >
                    <option value="">전체 제공자</option>
                    {Array.from(
                      new Set(
                        (snapshot?.agents ?? [])
                          .map((a) => a.provider)
                          .filter((x): x is string => !!x),
                      ),
                    ).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <span>기준 시각 {time(snapshot?.observedAt)}</span>
              </div>
              {progress && progress.catalogState !== "available" && (
                <p className="warning" role="status">{progress.catalogState === "stale" ? "비공개 프로젝트 목록 갱신 실패. 마지막 정상 목록을 표시합니다." : "비공개 프로젝트 목록을 불러올 수 없습니다."}</p>
              )}
              {privateProject && (
                <div className="empty">
                  <strong>{privateProject.label}</strong>
                  <p>등록된 비공개 프로젝트 · 확인된 작업 {progress?.runs.filter((r) => r.projectId === privateProject.id).length ?? 0}</p>
                  <p>운영자가 등록한 목록이며 GitHub 접근 범위와는 별개입니다.</p>
                  {privateProject.repositoryUrl && <a href={privateProject.repositoryUrl} target="_blank" rel="noreferrer noopener">GitHub 소스 보기</a>}
                </div>
              )}
              {stale && (
                <p className="warning" role="status">
                  새 기록을 불러오지 못했습니다.{" "}
                  {snapshot
                    ? "마지막으로 확인된 기록을 표시합니다."
                    : "연결을 확인한 후 다시 시도합니다."}
                </p>
              )}
              <div className="roster">
                <div className="roster-heading">
                  <span>에이전트 / 역할</span>
                  <span>제공자 / 모델</span>
                  <span>마지막 업무</span>
                  <span>상태</span>
                </div>
                {filtered.length ? (
                  filtered.slice(0, visibleCount).map((a) => (
                    <button
                      className="roster-row"
                      key={a.id}
                      onClick={() => setSelected(a.id)}
                    >
                      <span className="person">
                        {a.roleId ? (
                          <Avatar role={a.roleId} />
                        ) : (
                          <span className="unknown">?</span>
                        )}
                        <span>
                          <strong>{agentLabel(a)}</strong>
                          <small>
                            {a.roleId ? roles[a.roleId][0] : "역할 확인 불가"} ·{" "}
                            {a.projectId ?? "프로젝트 확인 불가"}
                          </small>
                          <small>
                            작업:{" "}
                            {a.currentTaskId
                              ? (snapshot?.tasks.find(
                                  (t) => t.id === a.currentTaskId,
                                )?.title ?? "등록된 제목 없음")
                              : "확인 불가"}
                          </small>
                        </span>
                      </span>
                      <span>
                        {a.provider ?? "제공자 확인 불가"}
                        <small>{a.model ?? "모델 확인 불가"}</small>
                      </span>
                      <span>{time(a.lastActivityAt)}</span>
                      <span className="status">
                        {
                          {
                            working: "작업 시작 기록",
                            completed: "완료 기록",
                            blocked: "차단됨",
                            idle: "대기 기록",
                            unknown: "확인 불가",
                          }[a.status]
                        }
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty">
                    {snapshot
                      ? "조건에 맞는 에이전트 기록이 없습니다."
                      : "업무 기록을 기다리고 있습니다."}
                  </div>
                )}
              </div>
              {visibleCount < filtered.length && (
                <button
                  className="more"
                  onClick={() => setVisibleCount((n) => n + 20)}
                >
                  더 보기 ({visibleCount} / {filtered.length})
                </button>
              )}
              <h3 className="task-title">
                작업 <span>{tasks.length}</span>
              </h3>
              <div className="task-list">
                {tasks.length ? (
                  tasks.map((t) => (
                    <div key={t.id}>
                      <strong>
                        {t.title ?? "제목 확인 불가"}
                        <small>
                          담당:{" "}
                          {t.assigneeIds.length
                            ? t.assigneeIds
                                .map((id) => {
                                  const assignee = snapshot?.agents.find((a) => a.id === id);
                                  return assignee?.name != null ? agentLabel(assignee) : id;
                                })
                                .join(", ")
                            : "확인 불가"}
                        </small>
                      </strong>
                      <span>
                        {t.status === "qa"
                          ? "검증 중"
                          : t.status === "done"
                            ? "완료"
                            : t.status}{" "}
                        · {time(t.updatedAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">확인된 작업이 없습니다.</p>
                )}
              </div>
            </section>
            <SourceCoverageView coverage={snapshot?.coverage ?? []} />
          </>
        )}
        <section className="public">
          <div className="section-head">
            <div>
              <p className="eyebrow">공개 자료</p>
              <h2>GitHub 프로젝트</h2>
            </div>
            <p>공개 저장소에서 가져온 별도의 기록입니다.</p>
          </div>
          {projectsError && (
            <p className="warning">
              GitHub 프로젝트 갱신 실패 또는 요청 제한.{" "}
              {projectsChecked
                ? "마지막 정상 기록을 표시합니다."
                : "현재 기록을 불러올 수 없습니다."}
            </p>
          )}
          <p className="muted">프로젝트 마지막 확인 {time(projectsChecked)}</p>
          <div className="public-list">
            {projects.map((p) => (
              <a key={p.name} href={p.htmlUrl} target="_blank" rel="noreferrer">
                <strong>{p.fullName}</strong>
                <span>업데이트 {time(p.updatedAt)}</span>
              </a>
            ))}
          </div>
          {publicProject && (
            <div className="task-list">
              <h3>{publicProject} 공개 작업</h3>
              {runsError && (
                <p className="warning">
                  GitHub 작업 갱신 실패 또는 요청 제한.{" "}
                  {runsChecked
                    ? "마지막 정상 기록을 표시합니다."
                    : "현재 기록을 불러올 수 없습니다."}
                </p>
              )}
              <p className="muted">마지막 확인 {time(runsChecked)}</p>
              {runs.map((r) => (
                <div key={r.id}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <span>
                    {r.status} · {time(r.updatedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {agent && snapshot && (
        <AgentDetail
          agent={agent}
          snapshot={snapshot}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
