import type { RoleId } from "@/lib/status-contract";
export const roles: Record<RoleId, [string, string, string]> = {
  atlas: ["Atlas", "방향과 판단", "#575b9a"],
  forge: ["Forge", "개발과 구현", "#a85e2c"],
  frame: ["Frame", "화면 구조와 사용성", "#267b78"],
  palette: ["Palette", "시각 디자인과 일러스트", "#9d4b76"],
  scout: ["Scout", "조사와 탐색", "#707c35"],
  sentinel: ["Sentinel", "검증과 보안", "#586e90"],
};

export function Avatar({ role }: { role: RoleId }) {
  return (
    <svg
      className="avatar"
      viewBox="0 0 48 48"
      aria-hidden="true"
      style={{ color: roles[role][2] }}
    >
      {role === "sentinel" ? (
        <path
          d="M8 12 24 6l16 6v13c0 9-7 14-16 18C15 39 8 34 8 25Z"
          fill="#f3f0ea"
          stroke="currentColor"
          strokeWidth="2"
        />
      ) : (
        <rect
          x="7"
          y="11"
          width="34"
          height="31"
          rx="10"
          fill="#f3f0ea"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
      <path
        d="M18 26h.1M30 26h.1M21 33h6"
        stroke="#273a3a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {role === "atlas" && <path d="M19 12V3l9 4-9 4" fill="currentColor" />}
      {role === "forge" && <path d="M8 14h32l-3 7H11Z" fill="currentColor" />}
      {role === "frame" && <path d="m24 3 8 8-5 1-2 5Z" fill="currentColor" />}
      {role === "palette" && (
        <path d="m10 11 5-7 19 4 3 5Z" fill="currentColor" />
      )}
      {role === "scout" && (
        <circle
          cx="30"
          cy="26"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
