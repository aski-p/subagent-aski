import type { CSSProperties, ReactNode } from "react";

export type ToonAgentCategory = "human" | "animal" | "fantasy" | "robot";
export type ToonAgentStatus = "working" | "review" | "waiting" | "idle" | "blocked" | "paused" | "completed";

export type ToonAgentProps = {
  primary: string;
  accent: string;
  skin: string;
  category: ToonAgentCategory;
  variant: number;
  accessory: string;
  expression: "happy" | "focused" | "cool";
  roleMark: string;
  status: ToonAgentStatus;
};

const outline = "#193d3c";
const pale = "#fff6d6";

function Face({ expression, robot = false }: { expression: ToonAgentProps["expression"]; robot?: boolean }) {
  const eye = robot ? "#7ff5df" : outline;
  if (expression === "focused") {
    return (
      <g fill="none" stroke={eye} strokeLinecap="round" strokeWidth="3.8">
        <path d="m34 47 7 1" /><path d="m55 48 7-1" />
        <path d="M44 58q4 2 8 0" strokeWidth="2.5" />
      </g>
    );
  }
  if (expression === "cool") {
    return (
      <g>
        <path d="M31 45h13l2 8H33Z" fill="#163a43" stroke={outline} strokeLinejoin="round" strokeWidth="2.5" />
        <path d="M50 45h13l-2 8H48Z" fill="#163a43" stroke={outline} strokeLinejoin="round" strokeWidth="2.5" />
        <path d="M44 47h6" stroke={outline} strokeWidth="2.5" />
        <path d="M44 58q4 2 8 0" fill="none" stroke={eye} strokeLinecap="round" strokeWidth="2.5" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx="39" cy="48" rx="2.8" ry="4" fill={eye} />
      <ellipse cx="57" cy="48" rx="2.8" ry="4" fill={eye} />
      <path d="M43 57q5 6 11 0" fill="none" stroke={eye} strokeLinecap="round" strokeWidth="2.5" />
      {!robot && <><circle cx="31" cy="55" r="3.5" fill="#ed7f78" opacity=".35" /><circle cx="65" cy="55" r="3.5" fill="#ed7f78" opacity=".35" /></>}
    </g>
  );
}

function HumanHair({ variant }: { variant: number }) {
  const shape = variant % 5;
  if (shape === 0) return <path d="M24 41q0-25 24-25 21 0 24 21-14-9-35-1l-7 12Z" fill="var(--toon-accent)" stroke={outline} strokeLinejoin="round" strokeWidth="4" />;
  if (shape === 1) return <><path d="M23 42q0-27 25-27t25 27v21l-11-4-3-26q-14 8-27 1l-1 27-9 3Z" fill="var(--toon-accent)" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><path d="M29 26q19 11 36-3" fill="none" stroke="var(--toon-primary)" strokeLinecap="round" strokeWidth="4" /></>;
  if (shape === 2) return <><path d="M25 40q0-24 23-24 24 0 24 24-13-12-37-4l-5 13Z" fill="var(--toon-accent)" stroke={outline} strokeWidth="4" /><path d="M68 24q15-5 16 10-4 12-15 8" fill="var(--toon-accent)" stroke={outline} strokeWidth="4" /></>;
  if (shape === 3) return <path d="m24 40 4-16 8 5 5-15 8 12 10-14 2 15 13-7-5 22q-21-9-40 2Z" fill="var(--toon-accent)" stroke={outline} strokeLinejoin="round" strokeWidth="4" />;
  return <g fill="var(--toon-accent)" stroke={outline} strokeWidth="3.5"><circle cx="30" cy="29" r="11" /><circle cx="43" cy="21" r="12" /><circle cx="58" cy="22" r="12" /><circle cx="69" cy="32" r="11" /><path d="M24 39q25-13 48 1" /></g>;
}

function HumanHead({ variant, expression }: Pick<ToonAgentProps, "variant" | "expression">) {
  const row = Math.floor(variant / 5);
  return (
    <g data-anatomy={`human-${variant}`}>
      {variant % 5 === 2 && <path d="M68 28q18 0 15 22l-10-4" fill="var(--toon-accent)" stroke={outline} strokeWidth="4" />}
      <path d="M27 39q0-21 21-21t21 21v13q0 20-21 22-21-2-21-22Z" fill="var(--toon-skin)" stroke={outline} strokeWidth="4.5" />
      <path d="M52 69q13-4 17-17v5q-2 14-17 17Z" fill="#b66b5d" opacity=".16" />
      <HumanHair variant={variant} />
      {row === 1 && <path d="M24 28h49l-7-12H34Z" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4" />}
      {row === 2 && <><path d="M25 34h46" stroke={outline} strokeWidth="4" /><circle cx="40" cy="34" r="6" fill="#7ed8df" stroke={outline} strokeWidth="3" /><circle cx="56" cy="34" r="6" fill="#7ed8df" stroke={outline} strokeWidth="3" /></>}
      {row === 3 && <><path d="M29 27q19-9 39 1" fill="none" stroke="var(--toon-primary)" strokeWidth="5" /><path d="m67 24 12-11-3 17" fill="#f2cf66" stroke={outline} strokeLinejoin="round" strokeWidth="3" /></>}
      {row === 4 && <path d="M22 38q5-27 26-28 23 2 28 30l-10-9q-19 5-36 0Z" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4" />}
      <Face expression={expression} />
    </g>
  );
}

function AnimalFeatures({ variant }: { variant: number }) {
  switch (variant) {
    case 0: return <><path d="m27 30 2-20 15 13M69 30l-2-20-15 13" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><path d="M35 34h5M56 34h5" stroke="#8c5c31" strokeWidth="3" /></>;
    case 1: return <><path d="M28 28Q10 20 17 46l13 2M68 28q18-8 11 18l-13 2" fill="var(--toon-accent)" stroke={outline} strokeWidth="4" /><path d="M48 53q-7 0-7 5 7 7 14 0 0-5-7-5" fill="#433b35" /></>;
    case 2: return <><path d="m25 31 4-23 17 16M71 31 67 8 50 24" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M48 54 43 48h10Z" fill="#3c3330" /></>;
    case 3: return <><path d="M31 27Q24-2 35 1q10 9 9 27M65 27Q72-2 61 1q-10 9-9 27" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M34 5q5 8 5 20M62 5q-5 8-5 20" fill="none" stroke={pale} strokeWidth="4" opacity=".55" /></>;
    case 4: return <><circle cx="28" cy="26" r="12" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><circle cx="68" cy="26" r="12" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /></>;
    case 5: return <><circle cx="28" cy="26" r="11" fill="#273b38" stroke={outline} strokeWidth="4" /><circle cx="68" cy="26" r="11" fill="#273b38" stroke={outline} strokeWidth="4" /><ellipse cx="38" cy="48" rx="7" ry="10" fill="#324b47" transform="rotate(18 38 48)" /><ellipse cx="58" cy="48" rx="7" ry="10" fill="#324b47" transform="rotate(-18 58 48)" /></>;
    case 6: return <><circle cx="30" cy="27" r="8" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><circle cx="66" cy="27" r="8" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M42 57q6 5 12 0" fill="none" stroke="#5c4438" strokeWidth="3" /></>;
    case 7: return <><path d="m27 30 2-19 14 14M69 30l-2-19-14 14" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M29 44q10-10 19 1 9-11 19-1l-5 11q-14-8-28 0Z" fill="#39413f" opacity=".9" /></>;
    case 8: return <><path d="m24 31 5-24 18 18M72 31 67 7 49 25" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="m31 39 10 4M65 39l-10 4" stroke={outline} strokeLinecap="round" strokeWidth="3.5" /></>;
    case 9: return <><path d="M17 43Q16 14 48 10q32 4 31 33L68 69H28Z" fill="#d69b3e" stroke={outline} strokeWidth="4" /><circle cx="48" cy="48" r="22" fill="var(--toon-primary)" /></>;
    case 10: return <><path d="m26 29 3-20 16 14M70 29 67 9 51 23" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="m34 28 5 9M48 25v11M62 28l-5 9" stroke="#65442d" strokeLinecap="round" strokeWidth="3" /></>;
    case 11: return <><circle cx="25" cy="33" r="15" fill="#91a7a0" stroke={outline} strokeWidth="4" /><circle cx="71" cy="33" r="15" fill="#91a7a0" stroke={outline} strokeWidth="4" /><circle cx="25" cy="33" r="7" fill="#d4e0d8" /><circle cx="71" cy="33" r="7" fill="#d4e0d8" /></>;
    case 12: return <><circle cx="29" cy="28" r="8" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><circle cx="67" cy="28" r="8" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><circle cx="29" cy="57" r="6" fill="#f0a49a" opacity=".6" /><circle cx="67" cy="57" r="6" fill="#f0a49a" opacity=".6" /></>;
    case 13: return <><circle cx="29" cy="27" r="8" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><circle cx="67" cy="27" r="8" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M75 67q25-10 12 22-8 12-19 2" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /></>;
    case 14: return <><path d="M28 36q5-23 20-23t20 23" fill="#243d45" stroke={outline} strokeWidth="4" /><path d="m43 51 5-4 7 4-7 6Z" fill="#e6a13d" stroke={outline} strokeLinejoin="round" strokeWidth="2.5" /></>;
    case 15: return <><path d="m23 36 9-22 16 13 16-13 9 22" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><circle cx="38" cy="48" r="10" fill="#f5e2a0" opacity=".72" /><circle cx="58" cy="48" r="10" fill="#f5e2a0" opacity=".72" /><path d="m44 56 4-5 4 5-4 5Z" fill="#d18d3d" /></>;
    case 16: return <><path d="M23 40 34 16l14 11 14-11 11 24-13-4-12 7-12-7Z" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="m43 52 5-5 7 5-7 6Z" fill="#d8a24b" /></>;
    case 17: return <><path d="m39 52 9-6 12 6-12 8Z" fill="#e6a642" stroke={outline} strokeLinejoin="round" strokeWidth="3" /><path d="M30 27q18-11 36 0" fill="none" stroke="var(--toon-primary)" strokeWidth="5" /></>;
    case 18: return <><circle cx="33" cy="35" r="8" fill="#e9d36b" stroke={outline} strokeWidth="4" /><circle cx="63" cy="35" r="8" fill="#e9d36b" stroke={outline} strokeWidth="4" /><path d="M28 54q20 14 40 0" fill="none" stroke="#316a45" strokeLinecap="round" strokeWidth="4" /></>;
    case 19: return <><circle cx="31" cy="29" r="6" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /><circle cx="65" cy="29" r="6" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /><path d="M44 57q4 4 8 0" fill="none" stroke="#5a4637" strokeWidth="3" /></>;
    case 20: return <><path d="M29 31Q12 30 19 54q9 13 18 0" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M67 31q17-1 10 23-9 13-18 0" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /><path d="M48 54v21q7 5 10-2" fill="none" stroke="var(--toon-primary)" strokeLinecap="round" strokeWidth="8" /></>;
    case 21: return <><path d="M31 26 28 7M65 26l3-19" stroke={outline} strokeWidth="5" /><circle cx="28" cy="6" r="5" fill="#d8aa57" stroke={outline} strokeWidth="3" /><circle cx="68" cy="6" r="5" fill="#d8aa57" stroke={outline} strokeWidth="3" /><circle cx="38" cy="40" r="4" fill="#9c6633" /><circle cx="58" cy="57" r="4" fill="#9c6633" /></>;
    case 22: return <><path d="M33 28 25 16l2-13M28 15 17 10M63 28l8-12-2-13M69 15l11-5" fill="none" stroke="#7b5635" strokeLinecap="round" strokeWidth="4" /><path d="m29 31 3-17 13 12M67 31l-3-17-13 12" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /></>;
    case 23: return <><path d="m31 25 4-14 8 12 6-17 7 17 8-10 2 18" fill="#9cc35f" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><path d="M69 64q19 1 19 17-11 1-19-7" fill="var(--toon-primary)" stroke={outline} strokeWidth="4" /></>;
    default: return <><path d="M25 64q-16 7-10 25M36 68q-11 15-3 26M60 68q11 15 3 26M71 64q16 7 10 25" fill="none" stroke="var(--toon-primary)" strokeLinecap="round" strokeWidth="9" /><circle cx="48" cy="28" r="6" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /></>;
  }
}

function AnimalHead({ variant, expression }: Pick<ToonAgentProps, "variant" | "expression">) {
  return (
    <g data-anatomy={`animal-${variant}`}>
      <AnimalFeatures variant={variant} />
      <path d="M25 39q0-21 23-22 23 1 23 22v14q0 19-23 21-23-2-23-21Z" fill="var(--toon-primary)" stroke={outline} strokeWidth="4.5" />
      <path d="M48 72q17-4 21-21v8q-5 13-21 15Z" fill="var(--toon-accent)" opacity=".22" />
      <AnimalFeatures variant={variant} />
      <Face expression={expression} />
    </g>
  );
}

function FantasyDetails({ variant }: { variant: number }) {
  switch (variant) {
    case 0: return <path d="M22 42q1-25 15-17l11-13 10 13q15-8 16 17" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4" />;
    case 1: return <><path d="M34 30 23 14m12 9-1-17M62 30l11-16m-12 9L62 6" stroke="#6e5034" strokeLinecap="round" strokeWidth="5" /><circle cx="24" cy="13" r="7" fill="#75ad54" /><circle cx="69" cy="13" r="8" fill="#75ad54" /></>;
    case 2: return <g fill="#eaf9ff" stroke={outline} strokeWidth="3"><circle cx="29" cy="29" r="11" /><circle cx="43" cy="21" r="13" /><circle cx="59" cy="22" r="12" /><circle cx="69" cy="32" r="10" /></g>;
    case 3: return <path d="M29 39q-3-16 10-30 2 10 9 12 7-9 12-17 12 21 5 36" fill="#ef694d" stroke={outline} strokeLinejoin="round" strokeWidth="4" />;
    case 4: return <path d="M48 5q17 20 17 31a17 17 0 0 1-34 0Q31 25 48 5Z" fill="#62c9df" stroke={outline} strokeWidth="4" />;
    case 5: return <><path d="m24 38 5-22 15 5 8-10 17 9 3 22" fill="#89938c" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><path d="m31 25 8 8m15-12 9 9" stroke="#c2cdc5" strokeWidth="3" /></>;
    case 6: return <><path d="M18 31q4-23 30-24 26 1 30 24Z" fill="#e05d50" stroke={outline} strokeWidth="4" /><circle cx="34" cy="18" r="5" fill="#fff0cc" /><circle cx="57" cy="15" r="4" fill="#fff0cc" /></>;
    case 7: return <><path d="m27 30 3-20 13 14M69 30l-3-20-13 14" fill="#d6b06f" stroke={outline} strokeWidth="4" /><path d="M22 67 7 54l2 28 16-5M74 67l15-13-2 28-16-5" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4" /></>;
    case 8: return <><path d="m48 3 6 13 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2Z" fill="#f4cf5d" stroke={outline} strokeLinejoin="round" strokeWidth="3" /></>;
    case 9: return <><path d="M22 43V20l11-11 15 7 15-7 11 11v23" fill="#a2a8a0" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><path d="M34 25h28v12H34Z" fill="#273f42" /><path d="m41 30 5 2m9 0 5-2" stroke="#8af0d6" strokeWidth="3" /></>;
    case 10: return <><path d="m32 31 2-23 12 14L55 3l8 20 9-8-3 22" fill="#8fe1e8" stroke={outline} strokeLinejoin="round" strokeWidth="4" /></>;
    case 11: return <><path d="M32 31 22 16l9 2 1-12 10 16M64 31l10-15-9 2-1-12-10 16" fill="#6ea34f" stroke={outline} strokeWidth="4" /><circle cx="26" cy="15" r="5" fill="#a8d46c" /><circle cx="70" cy="15" r="5" fill="#a8d46c" /></>;
    case 12: return <><path d="M23 36 8 29l12 20M73 36l15-7-12 20" fill="#71c3cf" stroke={outline} strokeWidth="4" /><path d="M37 65q11 13 22 0" fill="#e6f2e8" stroke={outline} strokeWidth="3" /></>;
    case 13: return <><path d="M20 68 7 48l1 32 16-4M76 68l13-20-1 32-16-4" fill="#bce8f5" stroke={outline} strokeWidth="3" /><path d="M27 29h42" stroke="#d99b4e" strokeWidth="5" /></>;
    case 14: return <path d="M18 47Q20 10 48 8q28 2 30 39L66 34l-4 34H34l-4-34Z" fill="#3c354e" stroke={outline} strokeLinejoin="round" strokeWidth="4" />;
    case 15: return <><circle cx="48" cy="31" r="28" fill="none" stroke="#f2c95d" strokeDasharray="7 6" strokeLinecap="round" strokeWidth="5" /><path d="m48 1 4 9 10 2-8 7 2 10-8-5-8 5 2-10-8-7 10-2Z" fill="#fff2a7" /></>;
    case 16: return <><circle cx="48" cy="29" r="23" fill="none" stroke="#d5a95c" strokeWidth="5" /><path d="M48 10v20l12 7" fill="none" stroke={outline} strokeLinecap="round" strokeWidth="4" /><circle cx="48" cy="29" r="4" fill="#f8dc80" /></>;
    case 17: return <><path d="m51 1-15 26h12l-7 22 21-31H50Z" fill="#f3d45d" stroke={outline} strokeLinejoin="round" strokeWidth="3" /><path d="M22 65 7 55m67 10 15-10" stroke="#8edbe5" strokeLinecap="round" strokeWidth="5" /></>;
    case 18: return <><path d="M26 37q5-27 22-30 17 3 22 30" fill="#513b34" stroke={outline} strokeWidth="4" /><path d="m35 20 7 9 5-13 8 14 7-9" fill="none" stroke="#ef684e" strokeLinecap="round" strokeWidth="4" /></>;
    case 19: return <><path d="m29 35 5-25 12 12 9-19 6 20 12-9-6 25" fill="#bfeeff" stroke={outline} strokeLinejoin="round" strokeWidth="4" /></>;
    case 20: return <><path d="M19 45Q24 9 49 8q25 3 29 37L63 32 48 21 33 32Z" fill="#64558c" stroke={outline} strokeWidth="4" /><path d="M69 15a13 13 0 1 1-12-9 10 10 0 0 0 12 9Z" fill="#f4df7c" /></>;
    case 21: return <><path d="M27 33 20 14l14 7 14-13 14 13 14-7-7 20" fill="#dfae42" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><circle cx="48" cy="18" r="4" fill="#65c7d5" /></>;
    case 22: return <><path d="M17 58h16v23H17Z" fill="#78d6c8" stroke={outline} strokeWidth="3" /><path d="M63 53h16v28H63Z" fill="#d87fa2" stroke={outline} strokeWidth="3" /><path d="M21 51h8M67 46h8" stroke={outline} strokeWidth="4" /></>;
    case 23: return <><circle cx="48" cy="25" r="17" fill="none" stroke="#c49450" strokeWidth="7" /><circle cx="48" cy="25" r="5" fill="#66cbd3" stroke={outline} strokeWidth="3" /><path d="m48 2 3 8m19 0-7 6m8 17-9-2M25 10l7 6m-7 17 9-2" stroke={outline} strokeWidth="3" /></>;
    default: return <><ellipse cx="48" cy="35" rx="35" ry="28" fill="none" stroke="#8fdde7" strokeWidth="5" opacity=".85" /><ellipse cx="48" cy="35" rx="25" ry="36" fill="none" stroke="#b9a2ef" strokeWidth="4" opacity=".8" transform="rotate(50 48 35)" /></>;
  }
}

function FantasyHead({ variant, expression }: Pick<ToonAgentProps, "variant" | "expression">) {
  const nonHuman = variant <= 6;
  return (
    <g data-anatomy={`fantasy-${variant}`}>
      <FantasyDetails variant={variant} />
      <path d="M26 39q0-21 22-22 22 1 22 22v14q0 19-22 21-22-2-22-21Z" fill={nonHuman ? "var(--toon-primary)" : "var(--toon-skin)"} stroke={outline} strokeWidth="4.5" />
      <path d="M50 72q14-4 18-19v8Q62 73 50 74Z" fill="var(--toon-accent)" opacity=".22" />
      <FantasyDetails variant={variant} />
      <Face expression={expression} />
    </g>
  );
}

function RobotHead({ variant, expression }: Pick<ToonAgentProps, "variant" | "expression">) {
  const shape = variant % 5;
  const row = Math.floor(variant / 5);
  const head: ReactNode = shape === 0
    ? <path d="M23 31q0-12 12-12h26q12 0 12 12v27q0 12-12 12H35q-12 0-12-12Z" />
    : shape === 1
      ? <circle cx="48" cy="45" r="27" />
      : shape === 2
        ? <path d="M20 38 31 18h34l11 20-7 29H27Z" />
        : shape === 3
          ? <path d="M25 42q0-28 23-28t23 28v26H25Z" />
          : <path d="M30 12h36l8 20-7 38H29l-7-38Z" />;
  return (
    <g data-anatomy={`robot-${variant}`}>
      {row === 0 && <><path d="M48 18V5" stroke={outline} strokeWidth="4" /><circle cx="48" cy="5" r="5" fill="#f1c852" stroke={outline} strokeWidth="3" /></>}
      {row === 1 && <><path d="m29 23-12-9M67 23l12-9" stroke={outline} strokeWidth="4" /><circle cx="15" cy="12" r="5" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /><circle cx="81" cy="12" r="5" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /></>}
      {row === 2 && <path d="M22 30 9 36v16l14 7M74 30l13 6v16l-14 7" fill="var(--toon-accent)" stroke={outline} strokeLinejoin="round" strokeWidth="4" />}
      {row === 3 && <><path d="M29 18Q48-1 67 18" fill="none" stroke="#d8a555" strokeWidth="5" /><path d="M48 4v12" stroke="#d8a555" strokeWidth="4" /></>}
      {row === 4 && <><ellipse cx="48" cy="14" rx="25" ry="9" fill="none" stroke="#72e6e1" strokeWidth="4" /><circle cx="48" cy="14" r="4" fill="#fff5ad" /></>}
      <g fill="var(--toon-skin)" stroke={outline} strokeLinejoin="round" strokeWidth="4.5">{head}</g>
      <path d="M29 37h38v22H29Z" fill="#173d46" stroke={outline} strokeLinejoin="round" strokeWidth="3" />
      <path d="M32 39h31v4H32Z" fill="#69d5ce" opacity=".32" />
      {shape === 2 ? <><circle cx="48" cy="49" r="8" fill="#79f2df" /><circle cx="48" cy="49" r="3" fill="#fffbd0" /></> : <Face expression={expression} robot />}
    </g>
  );
}

function Accessory({ accessory }: Pick<ToonAgentProps, "accessory">) {
  switch (accessory) {
    case "망토": return <path d="M26 73Q11 84 18 116h60q7-32-8-43-20 14-44 0Z" fill="var(--toon-accent)" stroke={outline} strokeLinejoin="round" strokeWidth="4" opacity=".95" />;
    case "왕관": return <path d="m32 22-3-17 12 9 7-13 8 13 12-9-4 18Z" fill="#f2ca58" stroke={outline} strokeLinejoin="round" strokeWidth="3.5" />;
    case "마법모자": return <><path d="m29 30 17-31 19 31Z" fill="#66549a" stroke={outline} strokeLinejoin="round" strokeWidth="4" /><path d="M20 30h56" stroke={outline} strokeLinecap="round" strokeWidth="6" /></>;
    case "고글": return <><circle cx="39" cy="46" r="8" fill="#7ed8df" fillOpacity=".68" stroke={outline} strokeWidth="3" /><circle cx="57" cy="46" r="8" fill="#7ed8df" fillOpacity=".68" stroke={outline} strokeWidth="3" /><path d="M47 46h2" stroke={outline} strokeWidth="3" /></>;
    case "안경": return <><circle cx="39" cy="48" r="7" fill="none" stroke={outline} strokeWidth="2.8" /><circle cx="57" cy="48" r="7" fill="none" stroke={outline} strokeWidth="2.8" /><path d="M46 48h4" stroke={outline} strokeWidth="2.8" /></>;
    case "목도리": return <><path d="M27 68q21 10 42 0l1 12q-22 9-44 0Z" fill="#e36d5c" stroke={outline} strokeWidth="3.5" /><path d="m63 77 9 26-12 2-5-25" fill="#e36d5c" stroke={outline} strokeWidth="3.5" /></>;
    case "헤드셋": return <><path d="M21 48Q20 17 48 16q28 1 27 32" fill="none" stroke={outline} strokeWidth="4" /><rect x="18" y="43" width="9" height="17" rx="4" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /><rect x="69" y="43" width="9" height="17" rx="4" fill="var(--toon-primary)" stroke={outline} strokeWidth="3" /><path d="M75 57q3 12-12 11" fill="none" stroke={outline} strokeWidth="3" /></>;
    case "배낭": return <path d="M67 78q14-5 17 8v25H65Z" fill="#8b6849" stroke={outline} strokeWidth="4" />;
    case "리본": return <path d="M70 20q6-11 14-4l-5 8 6 7q-9 6-15-5-6 11-15 5l6-7-5-8q8-7 14 4Z" fill="#df6f9d" stroke={outline} strokeLinejoin="round" strokeWidth="3" />;
    case "수정관": return <path d="m30 23 4-18 11 11 7-15 7 15 10-11-3 19Z" fill="#81dce5" stroke={outline} strokeLinejoin="round" strokeWidth="3.5" />;
    case "작은 날개": return <><path d="M25 80 7 67l3 26 18-5M71 80l18-13-3 26-18-5" fill="#d9f6ff" fillOpacity=".88" stroke={outline} strokeWidth="3" /></>;
    case "뿔": return <><path d="M31 27Q17 12 27 4q12 9 13 24M65 27Q79 12 69 4q-12 9-13 24" fill="#d8b063" stroke={outline} strokeWidth="3.5" /></>;
    case "마법책": return <path d="M69 82q10-6 17 0v23q-8-5-17 1-9-6-17-1V82q8-6 17 0Z" fill="#f4e7bc" stroke={outline} strokeLinejoin="round" strokeWidth="3" />;
    case "오라": return <ellipse cx="48" cy="69" rx="41" ry="57" fill="none" stroke="#84e7dc" strokeDasharray="7 8" strokeLinecap="round" strokeWidth="4" opacity=".75" />;
    case "안테나": return <><path d="M48 19V4" stroke={outline} strokeWidth="4" /><circle cx="48" cy="4" r="5" fill="#f2cc58" stroke={outline} strokeWidth="3" /></>;
    case "홀로링": return <ellipse cx="48" cy="18" rx="28" ry="9" fill="none" stroke="#74e9e5" strokeWidth="4" opacity=".9" />;
    case "툴암": return <><path d="m72 79 15-10 5 9-13 13" fill="none" stroke={outline} strokeWidth="6" /><path d="m87 67 5-6m-3 9 7-1" stroke="#e2ae50" strokeWidth="4" /></>;
    case "제트팩": return <><path d="M68 76h17v30H68Z" fill="#718993" stroke={outline} strokeWidth="4" /><path d="m71 106 5 16 5-16" fill="#ef7b4f" stroke={outline} strokeLinejoin="round" strokeWidth="3" /></>;
    default: return null;
  }
}

const backAccessories = new Set(["망토", "배낭", "작은 날개", "오라", "제트팩"]);

function BackAccessory({ accessory }: Pick<ToonAgentProps, "accessory">) {
  return backAccessories.has(accessory) ? <Accessory accessory={accessory} /> : null;
}

function FrontAccessory({ accessory }: Pick<ToonAgentProps, "accessory">) {
  return backAccessories.has(accessory) ? null : <Accessory accessory={accessory} />;
}

function StatusMark({ status }: Pick<ToonAgentProps, "status">) {
  if (status === "blocked") return <g transform="translate(70 5)"><circle cx="10" cy="10" r="9" fill="#d85b59" stroke={pale} strokeWidth="2" /><path d="M10 5v7m0 3h.1" stroke="white" strokeLinecap="round" strokeWidth="3" /></g>;
  if (status === "completed") return <g transform="translate(70 5)"><circle cx="10" cy="10" r="9" fill="#45a875" stroke={pale} strokeWidth="2" /><path d="m5 10 3 3 7-7" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></g>;
  return null;
}

export function ToonAgent({ primary, accent, skin, category, variant, accessory, expression, roleMark, status }: ToonAgentProps) {
  const safeVariant = ((variant % 25) + 25) % 25;
  const style = {
    "--toon-primary": primary,
    "--toon-accent": accent,
    "--toon-skin": skin,
  } as CSSProperties;

  return (
    <svg
      className={`toon-agent category-${category} status-${status}`}
      viewBox="0 0 96 128"
      data-accessory={accessory}
      data-variant={safeVariant}
      data-signature={`${category}-${safeVariant}`}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="48" cy="119" rx="31" ry="7" fill="#173733" opacity=".24" />
      <BackAccessory accessory={accessory} />
      <g className="toon-body">
        <path d="M32 96v24q0 5-8 5H20q-5 0-3-5l7-27M64 96v24q0 5 8 5h4q5 0 3-5l-7-27" fill="#294f50" stroke={outline} strokeLinejoin="round" strokeWidth="4.5" />
        <path d="M29 119h-9q-7 2-4 6h17M67 119h9q7 2 4 6H63" fill="var(--toon-accent)" stroke={outline} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M27 70q21-11 42 0l8 42H19Z" fill="var(--toon-primary)" stroke={outline} strokeLinejoin="round" strokeWidth="4.5" />
        <path d="M49 70q14 1 20 5l5 33H52Z" fill="var(--toon-accent)" opacity=".27" />
        <path d="M29 77 17 91q-5 7 2 12M67 77l12 14q5 7-2 12" fill="none" stroke={outline} strokeLinecap="round" strokeWidth="13" />
        <path d="M29 77 18 92q-4 5 1 9M67 77l11 15q4 5-1 9" fill="none" stroke="var(--toon-primary)" strokeLinecap="round" strokeWidth="7" />
        <path d="M30 76q18 9 36 0" fill="none" stroke={pale} strokeLinecap="round" strokeWidth="3" opacity=".55" />
        <circle cx="48" cy="87" r="11" fill={pale} stroke={outline} strokeWidth="3" />
        <text x="48" y="91" textAnchor="middle" fontSize="10" fontWeight="900" fill={outline}>{roleMark.slice(0, 2)}</text>
      </g>
      {category === "human" && <HumanHead variant={safeVariant} expression={expression} />}
      {category === "animal" && <AnimalHead variant={safeVariant} expression={expression} />}
      {category === "fantasy" && <FantasyHead variant={safeVariant} expression={expression} />}
      {category === "robot" && <RobotHead variant={safeVariant} expression={expression} />}
      <FrontAccessory accessory={accessory} />
      <StatusMark status={status} />
    </svg>
  );
}
