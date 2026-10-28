import { SOURCES, type SourceCoverage } from "@/lib/status-contract";
const time = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "확인 불가";
export function SourceCoverageView({
  coverage,
}: {
  coverage: SourceCoverage[];
}) {
  return (
    <section className="coverage">
      <div className="section-head">
        <div>
          <p className="eyebrow">수집 범위</p>
          <h2>연결과 업무 기록</h2>
        </div>
        <p>수집기 연결은 현재 작업의 증거가 아닙니다.</p>
      </div>
      <div className="source-list">
        {SOURCES.map((source) => {
          const c = coverage.find((x) => x.source === source);
          return (
            <div className="source-row" key={source}>
              <div>
                <strong>{source}</strong>
                <b>
                  {c
                    ? {
                        connected: "연결됨",
                        stale: "보고 지연",
                        unknown: "확인 불가",
                        offline: "연결 끊김",
                      }[c.connection]
                    : "확인 불가"}
                </b>
              </div>
              <div>
                <span>수집 {time(c?.collectedAt)}</span>
                <span>마지막 업무 {time(c?.lastActivityAt)}</span>
                <span>
                  {c?.coverage === "registered"
                    ? "등록됨"
                    : c?.coverage === "metadata-only"
                      ? "메타데이터만"
                      : "지원 여부 확인 필요"}
                  {c?.reasonCode === "discovery_limited"
                    ? " · 선택된 최근 기록만 확인"
                    : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
