import type { RoleId } from "./status-contract";

// Each atlas contains equal-width idle and working frames. Portrait offsets are
// tuned to the individual character's head within the idle frame.
export const roleArt: Record<RoleId, { src: string; portraitLeft: string; portraitTop: string }> = {
  atlas: { src: "/characters/atlas-idle-work-v2.png", portraitLeft: "-78%", portraitTop: "-4%" },
  forge: { src: "/characters/forge-idle-work-v2.png", portraitLeft: "-92%", portraitTop: "-3%" },
  frame: { src: "/characters/frame-idle-work-v2.png", portraitLeft: "-78%", portraitTop: "-4%" },
  palette: { src: "/characters/palette-idle-work-v2.png", portraitLeft: "-95%", portraitTop: "-9%" },
  scout: { src: "/characters/scout-idle-work-v2.png", portraitLeft: "-90%", portraitTop: "-3%" },
  sentinel: { src: "/characters/sentinel-idle-work-v2.png", portraitLeft: "-91%", portraitTop: "-4%" },
};
