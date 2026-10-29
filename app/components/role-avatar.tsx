import { getImageProps } from "next/image";
import { roleArt } from "../../lib/role-art";
import type { AgentView, RoleId } from "@/lib/status-contract";
export const roles: Record<RoleId, [string, string, string]> = {
  atlas: ["Atlas(설계)", "방향과 판단", "#575b9a"],
  forge: ["Forge(개발)", "개발과 구현", "#a85e2c"],
  frame: ["Frame(UI/UX)", "화면 구조와 사용성", "#267b78"],
  palette: ["Palette(디자인)", "시각 디자인과 일러스트", "#9d4b76"],
  scout: ["Scout(조사)", "조사와 탐색", "#707c35"],
  sentinel: ["Sentinel(검수)", "검증과 보안", "#586e90"],
};

export function agentLabel(agent: Pick<AgentView, "name" | "roleId">): string {
  const name = agent.name ?? "이름 확인 불가";
  if (!agent.roleId) return name;
  const label = roles[agent.roleId][0];
  const base = label.split("(")[0];
  return name === base || name.startsWith(base + " ") || name.startsWith(base + "·")
    ? label + name.slice(base.length)
    : name;
}

export function Avatar({ role }: { role: RoleId }) {
  const art = roleArt[role];
  return (
    <span className="avatar" aria-hidden="true">
      {/* Next generates optimized responsive URLs for the atlas. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" {...getImageProps({ src: art.src, alt: "", width: 384, height: 256, sizes: "240px" }).props}
        style={{ left: art.portraitLeft, top: art.portraitTop }} />
    </span>
  );
}
