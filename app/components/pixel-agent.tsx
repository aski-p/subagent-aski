import type { CSSProperties } from "react";

export type PixelAgentCategory = "human" | "animal" | "fantasy" | "robot";
export type PixelAgentStatus = "working" | "review" | "waiting" | "idle" | "blocked" | "paused" | "completed";

export type PixelAgentProps = {
  primary: string;
  accent: string;
  skin: string;
  category: PixelAgentCategory;
  variant: number;
  accessory: string;
  expression: "happy" | "focused" | "cool";
  roleMark: string;
  status: PixelAgentStatus;
};

function Eyes({ expression }: Pick<PixelAgentProps, "expression">) {
  if (expression === "focused") {
    return <><rect x="8" y="13" width="3" height="1" /><rect x="14" y="13" width="3" height="1" /></>;
  }
  if (expression === "cool") {
    return <><rect x="8" y="12" width="3" height="2" /><rect x="14" y="12" width="3" height="2" /><rect x="11" y="12" width="3" height="1" /></>;
  }
  return <><rect x="9" y="12" width="2" height="2" /><rect x="15" y="12" width="2" height="2" /><rect x="12" y="15" width="3" height="1" /></>;
}

function CategoryParts({ category, variant }: Pick<PixelAgentProps, "category" | "variant">) {
  if (category === "animal") {
    return (
      <>
        <rect data-part="animal-ear" x="6" y="5" width="4" height="5" fill="var(--pixel-primary)" />
        <rect data-part="animal-ear" x="16" y="5" width="4" height="5" fill="var(--pixel-primary)" />
        <rect x="7" y="6" width="2" height="3" fill="var(--pixel-skin)" />
        <rect x="17" y="6" width="2" height="3" fill="var(--pixel-skin)" />
        {variant % 2 === 0 && <rect x="18" y="22" width="4" height="2" fill="var(--pixel-primary)" />}
      </>
    );
  }
  if (category === "robot") {
    return (
      <>
        <rect data-part="robot-antenna" x="12" y="3" width="2" height="4" fill="var(--pixel-outline)" />
        <rect x="11" y="2" width="4" height="2" fill="var(--pixel-accent)" />
        <rect x="7" y="11" width="12" height="5" fill="#bcecf0" />
      </>
    );
  }
  if (category === "fantasy") {
    return (
      <>
        <rect x="5" y="8" width="3" height="4" fill="var(--pixel-accent)" />
        <rect x="18" y="8" width="3" height="4" fill="var(--pixel-accent)" />
        {variant % 3 === 0 && <><rect x="3" y="18" width="4" height="5" fill="var(--pixel-primary)" /><rect x="19" y="18" width="4" height="5" fill="var(--pixel-primary)" /></>}
      </>
    );
  }
  return (
    <>
      <rect x="7" y="6" width="12" height="4" fill="var(--pixel-primary)" />
      {variant % 2 === 1 && <rect x="6" y="8" width="3" height="8" fill="var(--pixel-primary)" />}
    </>
  );
}

function Accessory({ accessory }: Pick<PixelAgentProps, "accessory">) {
  if (accessory === "헤드셋") {
    return <><rect x="5" y="10" width="2" height="7" fill="var(--pixel-outline)" /><rect x="19" y="10" width="2" height="7" fill="var(--pixel-outline)" /><rect x="19" y="16" width="3" height="2" fill="var(--pixel-accent)" /></>;
  }
  if (accessory === "안경" || accessory === "고글") {
    return <><rect x="7" y="11" width="5" height="4" fill="none" stroke="var(--pixel-outline)" /><rect x="14" y="11" width="5" height="4" fill="none" stroke="var(--pixel-outline)" /><rect x="12" y="12" width="2" height="1" fill="var(--pixel-outline)" /></>;
  }
  if (accessory === "왕관" || accessory === "수정관") {
    return <><rect x="8" y="4" width="10" height="3" fill="#ffd75a" /><rect x="8" y="2" width="2" height="3" fill="#ffd75a" /><rect x="12" y="1" width="2" height="4" fill="#ffd75a" /><rect x="16" y="2" width="2" height="3" fill="#ffd75a" /></>;
  }
  if (accessory === "안테나") {
    return <><rect x="12" y="1" width="2" height="4" fill="var(--pixel-outline)" /><rect x="11" y="0" width="4" height="2" fill="#ffcf4a" /></>;
  }
  return null;
}

export function PixelAgent({ primary, accent, skin, category, variant, accessory, expression, roleMark, status }: PixelAgentProps) {
  const style = {
    "--pixel-primary": primary,
    "--pixel-accent": accent,
    "--pixel-skin": skin,
    "--pixel-outline": "#26343a",
  } as CSSProperties;

  return (
    <svg
      className={`pixel-agent category-${category} status-${status}`}
      viewBox="0 0 24 32"
      shapeRendering="crispEdges"
      data-accessory={accessory}
      data-variant={variant % 6}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5" y="29" width="15" height="2" fill="#173037" opacity="0.28" />
      <rect x="7" y="24" width="4" height="6" fill="var(--pixel-outline)" />
      <rect x="15" y="24" width="4" height="6" fill="var(--pixel-outline)" />
      <rect x="6" y="28" width="6" height="2" fill="#1b2529" />
      <rect x="14" y="28" width="6" height="2" fill="#1b2529" />
      <CategoryParts category={category} variant={variant} />
      <rect x="6" y="9" width="14" height="9" fill="var(--pixel-outline)" />
      <rect x="7" y="8" width="12" height="9" fill={category === "robot" ? "#b8d4d8" : "var(--pixel-skin)"} />
      <Eyes expression={expression} />
      <rect x="5" y="18" width="16" height="8" fill="var(--pixel-outline)" />
      <rect x="6" y="18" width="14" height="7" fill="var(--pixel-primary)" />
      <rect x="6" y="18" width="14" height="2" fill="var(--pixel-accent)" />
      <rect x="3" y="19" width="3" height="6" fill="var(--pixel-primary)" />
      <rect x="20" y="19" width="3" height="6" fill="var(--pixel-primary)" />
      <rect x="10" y="20" width="6" height="4" fill="#f6f0d4" />
      <text x="13" y="23" textAnchor="middle" fontSize="3" fontWeight="800" fill="var(--pixel-outline)">{roleMark.slice(0, 2)}</text>
      <Accessory accessory={accessory} />
      {status === "blocked" && <><rect x="19" y="3" width="4" height="6" fill="#d94b4b" /><rect x="20" y="4" width="2" height="3" fill="#fff4cf" /><rect x="20" y="8" width="2" height="1" fill="#fff4cf" /></>}
      {status === "completed" && <><rect x="18" y="3" width="5" height="5" fill="#43a66f" /><rect x="19" y="5" width="1" height="1" fill="white" /><rect x="20" y="6" width="1" height="1" fill="white" /><rect x="21" y="4" width="1" height="1" fill="white" /></>}
    </svg>
  );
}
