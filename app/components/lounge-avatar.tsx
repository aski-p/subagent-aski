import { getImageProps } from "next/image";
import type { RoleId } from "../../lib/status-contract";
import type { LoungeMode } from "../../lib/lounge-contract";
import { roleArt } from "../../lib/role-art";

export function LoungeAvatar({ role, mode, paused }: { role: RoleId; mode: LoungeMode; paused: boolean }) {
  const working = mode === "working" || mode === "reviewing";
  return (
    <div className={`lounge-avatar lounge-avatar--${mode}${paused ? " is-paused" : ""}`} aria-hidden="true">
      <div className={`lounge-robot${working ? " is-working-pose" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...getImageProps({ src: roleArt[role].src, alt: "", width: 384, height: 256, sizes: "192px" }).props} alt="" />
      </div>
      {mode === "working" && <><span className="lounge-paper">▤</span><span className="lounge-sweat">●</span></>}
      {mode === "reviewing" && <span className="lounge-thought">✓ · ·</span>}
    </div>
  );
}
