"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { categoryMeta, characterPresets, getCharacterPreset, officeSkins, type CharacterCategory } from "./character-data";

type RunState = "running" | "paused" | "stopped";
type AgentState = "working" | "review" | "waiting" | "idle";
type Priority = "보통" | "높음" | "긴급";

type AvatarConfig = {
  presetId: string;
  primary: string;
  accent: string;
  skin: string;
  accessory: string;
  expression: "happy" | "focused" | "cool";
  scale: number;
};

type Agent = {
  id: string;
  name: string;
  role: string;
  roleKey: string;
  model: string;
  state: AgentState;
  task: string;
  speech: string;
  progress: number;
  color: string;
  accent: string;
  x: number;
  y: number;
  completed: number;
  queue: string[];
  logs: { time: string; text: string }[];
  avatar: AvatarConfig;
  placedUntil?: number;
};

type EventItem = {
  id: number;
  time: string;
  title: string;
  detail: string;
  tone: "mint" | "amber" | "blue" | "rose";
};

type PersistedOffice = {
  agents: Agent[];
  officeSkinId: string;
  selectedId: string;
  nextAgentNumber: number;
};

const STORAGE_KEY = "agent-office:v3";

const ROLE_OPTIONS = [
  ["판단 PM", "pm"],
  ["기획자", "planner"],
  ["UI/UX 디자이너", "designer"],
  ["프론트엔드 개발자", "developer"],
  ["QA 담당자", "qa"],
  ["리서처", "researcher"],
] as const;

const ACCESSORY_OPTIONS = ["없음", "망토", "왕관", "마법모자", "고글", "안경", "목도리", "헤드셋", "배낭", "리본", "수정관", "작은 날개", "뿔", "마법책", "오라", "안테나", "홀로링", "툴암", "제트팩"];
const AVATAR_SWATCHES = ["#4fac91", "#64a2df", "#d979a2", "#e4ae4e", "#9b7bd7", "#e47f63", "#78b96e", "#ef765f"];
const ACCESSORY_CLASSES: Record<string, string> = {
  "없음": "accessory-none",
  "망토": "accessory-cape",
  "왕관": "accessory-crown",
  "마법모자": "accessory-wizard-hat",
  "고글": "accessory-goggles",
  "안경": "accessory-glasses",
  "목도리": "accessory-scarf",
  "헤드셋": "accessory-headset",
  "배낭": "accessory-backpack",
  "리본": "accessory-ribbon",
  "수정관": "accessory-crystal-crown",
  "작은 날개": "accessory-small-wings",
  "뿔": "accessory-horns",
  "마법책": "accessory-magic-book",
  "오라": "accessory-aura",
  "안테나": "accessory-antenna",
  "홀로링": "accessory-holo-ring",
  "툴암": "accessory-tool-arm",
  "제트팩": "accessory-jetpack",
};

function avatarFrom(presetId: string): AvatarConfig {
  const preset = getCharacterPreset(presetId);
  return {
    presetId,
    primary: preset.primary,
    accent: preset.accent,
    skin: preset.skin,
    accessory: preset.defaultAccessory,
    expression: "happy",
    scale: 1,
  };
}

const initialAgents: Agent[] = [
  {
    id: "haram",
    name: "하람",
    role: "판단 PM",
    roleKey: "pm",
    model: "GPT SOL",
    state: "review",
    task: "요구사항 충돌 검토",
    speech: "핵심 범위를 3개로 좁혔어요.",
    progress: 72,
    color: "#f3a669",
    accent: "#633d85",
    avatar: avatarFrom("fantasy-10"),
    x: 48,
    y: 28,
    completed: 14,
    queue: ["최종 승인 기준 확정", "QA 결과 판정"],
    logs: [
      { time: "16:41", text: "기능 우선순위 충돌 2건을 정리했어요." },
      { time: "16:36", text: "디자이너와 모바일 범위를 합의했어요." },
      { time: "16:29", text: "프로젝트 목표를 3개 결과물로 분해했어요." },
    ],
  },
  {
    id: "moa",
    name: "모아",
    role: "기획자",
    roleKey: "planner",
    model: "Qwen 3.6",
    state: "working",
    task: "사용자 플로우 설계",
    speech: "예외 흐름까지 연결 중이에요.",
    progress: 64,
    color: "#5fbca8",
    accent: "#226b69",
    avatar: avatarFrom("animal-03"),
    x: 24,
    y: 36,
    completed: 23,
    queue: ["온보딩 문구 정리"],
    logs: [
      { time: "16:40", text: "고용 → 배치 → 실행 흐름을 완성했어요." },
      { time: "16:31", text: "중지 시 데이터 보존 규칙을 추가했어요." },
    ],
  },
  {
    id: "sena",
    name: "세나",
    role: "UI/UX 디자이너",
    roleKey: "designer",
    model: "GPT SOL",
    state: "working",
    task: "에이전트 오피스 UI 시안",
    speech: "모바일 패널도 함께 보고 있어요.",
    progress: 81,
    color: "#dc81a9",
    accent: "#833f6c",
    avatar: avatarFrom("human-10"),
    x: 72,
    y: 34,
    completed: 18,
    queue: ["다크 모드 토큰", "빈 상태 일러스트"],
    logs: [
      { time: "16:43", text: "직원 상세 패널의 정보 위계를 수정했어요." },
      { time: "16:35", text: "셀 셰이딩 컬러 토큰을 적용했어요." },
    ],
  },
  {
    id: "luke",
    name: "루크",
    role: "프론트엔드 개발자",
    roleKey: "developer",
    model: "Qwen 3.6",
    state: "working",
    task: "실시간 이벤트 스트림 연결",
    speech: "상태 동기화 훅을 붙이는 중!",
    progress: 46,
    color: "#6c9fe4",
    accent: "#314f91",
    avatar: avatarFrom("robot-14"),
    x: 63,
    y: 63,
    completed: 31,
    queue: ["재연결 처리", "명령 큐 낙관적 업데이트"],
    logs: [
      { time: "16:42", text: "SSE 이벤트 8종의 타입을 정의했어요." },
      { time: "16:33", text: "에이전트 상태 스토어를 연결했어요." },
    ],
  },
  {
    id: "yuni",
    name: "유니",
    role: "QA 담당자",
    roleKey: "qa",
    model: "GPT SOL",
    state: "waiting",
    task: "고용·해고 회귀 테스트",
    speech: "개발 완료 신호를 기다리고 있어요.",
    progress: 28,
    color: "#efc75e",
    accent: "#795b27",
    avatar: avatarFrom("animal-16"),
    x: 36,
    y: 69,
    completed: 42,
    queue: ["중지 후 재시작", "모바일 터치 영역"],
    logs: [
      { time: "16:38", text: "테스트 시나리오 18개를 준비했어요." },
      { time: "16:26", text: "심각도 기준을 PM에게 요청했어요." },
    ],
  },
  {
    id: "sol",
    name: "솔",
    role: "리서처",
    roleKey: "researcher",
    model: "Qwen 3.6",
    state: "idle",
    task: "다음 조사 대기",
    speech: "새로운 조사를 맡겨주세요.",
    progress: 0,
    color: "#87b96a",
    accent: "#3e6c3d",
    avatar: avatarFrom("fantasy-02"),
    x: 83,
    y: 72,
    completed: 16,
    queue: [],
    logs: [
      { time: "16:18", text: "경쟁 제품 조사 보고서를 전달했어요." },
      { time: "16:02", text: "레퍼런스 12개를 분류했어요." },
    ],
  },
];

const initialEvents: EventItem[] = [
  { id: 1, time: "방금", title: "세나가 시안을 업데이트", detail: "직원 상세 패널 v3", tone: "rose" },
  { id: 2, time: "2분", title: "하람의 판단이 필요함", detail: "모바일 범위 승인", tone: "amber" },
  { id: 3, time: "5분", title: "루크가 이벤트 연결 완료", detail: "agent.progress 수신", tone: "blue" },
];

const workflow = [
  { id: "brief", label: "브리프", owner: "PM", state: "done" },
  { id: "plan", label: "기획", owner: "모아", state: "done" },
  { id: "design", label: "디자인", owner: "세나", state: "active" },
  { id: "build", label: "개발", owner: "루크", state: "active" },
  { id: "qa", label: "QA", owner: "유니", state: "queued" },
  { id: "judge", label: "판단", owner: "하람", state: "queued" },
];

function now() {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function stateLabel(state: AgentState) {
  return { working: "작업 중", review: "검토 필요", waiting: "대기 중", idle: "휴식 중" }[state];
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    spark: <><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" /><path d="m19 15 .7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15Z" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    command: <><path d="M18 9a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 15H6L5 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    palette: <><circle cx="12" cy="12" r="9" /><circle cx="8" cy="9" r="1" /><circle cx="12" cy="7" r="1" /><circle cx="16" cy="10" r="1" /><path d="M16 16c-1.5 0-2-1-2-2s1-2 2.5-2H21" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>,
    move: <><path d="M12 2v20M2 12h20" /><path d="m8 6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function CharacterFigure({ avatar, roleMark = "✦", roleKey = "guest" }: { avatar: AvatarConfig; roleMark?: string; roleKey?: string }) {
  const preset = getCharacterPreset(avatar.presetId);
  const accessoryClass = ACCESSORY_CLASSES[avatar.accessory] ?? "accessory-none";
  return (
    <span
      className={`agent-figure role-${roleKey} category-${preset.category} variant-${preset.variant} shape-${preset.variant % 5} expression-${avatar.expression} ${accessoryClass}`}
      style={{
        "--agent": avatar.primary,
        "--agent-accent": avatar.accent,
        "--agent-skin": avatar.skin,
        "--avatar-scale": avatar.scale,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="agent-shadow" />
      <span className="avatar-wing wing-left" />
      <span className="avatar-wing wing-right" />
      <span className="avatar-tail" />
      <span className="avatar-ear ear-left" />
      <span className="avatar-ear ear-right" />
      <span className="avatar-antenna"><i /></span>
      <span className="agent-hair-back" />
      <span className="agent-neck" />
      <span className="agent-body"><span className="role-mark">{roleMark}</span></span>
      <span className="agent-arm arm-left" />
      <span className="agent-arm arm-right" />
      <span className="agent-leg leg-left" />
      <span className="agent-leg leg-right" />
      <span className="agent-head"><span className="face-panel" /><span className="eye eye-left" /><span className="eye eye-right" /><span className="agent-smile" /><span className="animal-muzzle" /></span>
      <span className="agent-hair" />
      <span className="avatar-hat" />
      <span className="agent-tool" />
      <span className="preset-symbol">{preset.category === "animal" ? "" : preset.symbol}</span>
    </span>
  );
}

function AgentFigure({ agent }: { agent: Agent }) {
  return <CharacterFigure avatar={agent.avatar} roleKey={agent.roleKey} roleMark={agent.role === "판단 PM" ? "◆" : agent.role.charAt(0)} />;
}

export default function Home() {
  const [agents, setAgents] = useState(initialAgents);
  const [selectedId, setSelectedId] = useState("haram");
  const [runState, setRunState] = useState<RunState>("running");
  const [events, setEvents] = useState(initialEvents);
  const [brief, setBrief] = useState("서브에이전트 오피스 MVP를 완성해줘");
  const [instruction, setInstruction] = useState("");
  const [priority, setPriority] = useState<Priority>("보통");
  const [instructionMode, setInstructionMode] = useState<"checkpoint" | "now">("checkpoint");
  const [detailTab, setDetailTab] = useState<"work" | "log">("work");
  const [detailOpen, setDetailOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [skinOpen, setSkinOpen] = useState(false);
  const [officeSkinId, setOfficeSkinId] = useState("guild");
  const [characterStudioOpen, setCharacterStudioOpen] = useState(false);
  const [studioTargetId, setStudioTargetId] = useState<string>("haram");
  const [studioDraft, setStudioDraft] = useState<AvatarConfig>(() => avatarFrom("fantasy-10"));
  const [characterCategory, setCharacterCategory] = useState<"all" | CharacterCategory>("all");
  const [characterSearch, setCharacterSearch] = useState("");
  const [hireAvatar, setHireAvatar] = useState<AvatarConfig>(() => avatarFrom("human-01"));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [nextAgentNumber, setNextAgentNumber] = useState(1);
  const [storageReady, setStorageReady] = useState(false);
  const [mobileTeamOpen, setMobileTeamOpen] = useState(false);
  const [confirmFire, setConfirmFire] = useState(false);
  const [toast, setToast] = useState("");
  const [hireForm, setHireForm] = useState({ name: "", role: "UI/UX 디자이너", model: "GPT SOL" });
  const officeSceneRef = useRef<HTMLDivElement>(null);
  const pressTimerRef = useRef<number | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const pressStartRef = useRef<{ agentId: string; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const selected = agents.find((agent) => agent.id === selectedId) ?? null;
  const selectedPreset = selected ? getCharacterPreset(selected.avatar.presetId) : null;
  const currentSkin = officeSkins.find((skin) => skin.id === officeSkinId) ?? officeSkins[0];
  const studioTarget = studioTargetId === "__hire__" ? null : agents.find((agent) => agent.id === studioTargetId) ?? null;
  const studioPreset = getCharacterPreset(studioDraft.presetId);
  const workingCount = agents.filter((agent) => agent.state === "working" || agent.state === "review").length;
  const averageProgress = Math.round(
    agents.reduce((total, agent) => total + agent.progress, 0) / Math.max(agents.length, 1),
  );

  const filteredEvents = useMemo(() => events.slice(0, 4), [events]);
  const visiblePresets = useMemo(() => {
    const query = characterSearch.trim().toLowerCase();
    return characterPresets.filter((preset) =>
      (characterCategory === "all" || preset.category === characterCategory)
      && (!query || preset.name.toLowerCase().includes(query) || preset.categoryLabel.toLowerCase().includes(query)),
    );
  }, [characterCategory, characterSearch]);

  const addEvent = (title: string, detail: string, tone: EventItem["tone"] = "mint") => {
    setEvents((current) => [
      { id: Date.now(), time: "방금", title, detail, tone },
      ...current.map((item) => item.time === "방금" ? { ...item, time: "1분" } : item),
    ].slice(0, 8));
  };

  const showToast = (message: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 2600);
  };

  const selectAgent = (agentId: string) => {
    setSelectedId(agentId);
    setInstruction("");
    setInstructionMode("checkpoint");
    setPriority("보통");
  };

  const openCharacterStudio = (targetId: string) => {
    const targetAvatar = targetId === "__hire__"
      ? hireAvatar
      : agents.find((agent) => agent.id === targetId)?.avatar;
    if (!targetAvatar) return;
    setStudioTargetId(targetId);
    setStudioDraft({ ...targetAvatar });
    setCharacterCategory("all");
    setCharacterSearch("");
    setCharacterStudioOpen(true);
  };

  const applyCharacterStudio = () => {
    if (studioTargetId === "__hire__") {
      setHireAvatar({ ...studioDraft });
    } else {
      setAgents((current) => current.map((agent) => agent.id === studioTargetId ? { ...agent, avatar: { ...studioDraft } } : agent));
      const target = agents.find((agent) => agent.id === studioTargetId);
      if (target) addEvent(`${target.name}의 캐릭터 변경`, getCharacterPreset(studioDraft.presetId).name, "mint");
    }
    setCharacterStudioOpen(false);
    showToast("새로운 캐릭터 외형을 적용했어요.");
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleAgentPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, agentId: string) => {
    if (event.button !== 0) return;
    clearPressTimer();
    dragMovedRef.current = false;
    pressStartRef.current = { agentId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    pressTimerRef.current = window.setTimeout(() => {
      draggingIdRef.current = agentId;
      setDraggingId(agentId);
      if ("vibrate" in navigator) navigator.vibrate(30);
    }, 380);
  };

  const handleAgentPointerMove = (event: ReactPointerEvent<HTMLButtonElement>, agentId: string) => {
    const start = pressStartRef.current;
    if (draggingIdRef.current !== agentId && start?.agentId === agentId) {
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (distance > 9) clearPressTimer();
    }
    if (draggingIdRef.current !== agentId || !officeSceneRef.current) return;
    const rect = officeSceneRef.current.getBoundingClientRect();
    const x = Math.max(7, Math.min(93, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(17, Math.min(88, ((event.clientY - rect.top) / rect.height) * 100));
    dragMovedRef.current = true;
    setAgents((current) => current.map((agent) => agent.id === agentId ? { ...agent, x, y } : agent));
  };

  const handleAgentPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>, agent: Agent) => {
    clearPressTimer();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const wasDragging = draggingIdRef.current === agent.id;
    const wasMoved = dragMovedRef.current;
    draggingIdRef.current = null;
    dragMovedRef.current = false;
    pressStartRef.current = null;
    setDraggingId(null);
    if (wasDragging && wasMoved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, placedUntil: Date.now() + 12000 } : item));
      addEvent(`${agent.name} 자리 이동`, "오피스의 새 위치로 배치했어요.", "blue");
      showToast(`${agent.name}을(를) 새 자리로 옮겼어요.`);
      return;
    }
    selectAgent(agent.id);
    setDetailOpen(true);
    setConfirmFire(false);
  };

  const cancelAgentPointer = () => {
    clearPressTimer();
    draggingIdRef.current = null;
    dragMovedRef.current = false;
    pressStartRef.current = null;
    setDraggingId(null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDetailOpen(window.innerWidth > 900), 0);
    return () => {
      window.clearTimeout(timer);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<PersistedOffice>;
          if (Array.isArray(saved.agents) && saved.agents.length && saved.agents.every((agent) => agent?.id && agent?.avatar?.presetId)) {
            setAgents(saved.agents);
            const restoredSelection = saved.agents.some((agent) => agent.id === saved.selectedId) ? saved.selectedId : saved.agents[0].id;
            setSelectedId(restoredSelection);
          }
          if (typeof saved.officeSkinId === "string" && officeSkins.some((skin) => skin.id === saved.officeSkinId)) setOfficeSkinId(saved.officeSkinId);
          if (typeof saved.nextAgentNumber === "number") setNextAgentNumber(saved.nextAgentNumber);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      const snapshot: PersistedOffice = { agents, officeSkinId, selectedId, nextAgentNumber };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // The office continues to work in-memory if browser storage is unavailable.
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [agents, nextAgentNumber, officeSkinId, selectedId, storageReady]);

  useEffect(() => {
    const closeTopLayer = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (characterStudioOpen) setCharacterStudioOpen(false);
      else if (skinOpen) setSkinOpen(false);
      else if (stopConfirmOpen) setStopConfirmOpen(false);
      else if (hireOpen) setHireOpen(false);
    };
    window.addEventListener("keydown", closeTopLayer);
    return () => window.removeEventListener("keydown", closeTopLayer);
  }, [characterStudioOpen, hireOpen, skinOpen, stopConfirmOpen]);

  useEffect(() => {
    if (!characterStudioOpen && !hireOpen && !skinOpen && !stopConfirmOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (!modal) return;
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    focusable[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    modal.addEventListener("keydown", trapFocus);
    return () => {
      modal.removeEventListener("keydown", trapFocus);
      previous?.focus();
    };
  }, [characterStudioOpen, hireOpen, skinOpen, stopConfirmOpen]);

  useEffect(() => {
    if (runState !== "running") return;
    const progressTimer = window.setInterval(() => {
      setAgents((current) => current.map((agent) => {
        if (agent.state !== "working" || agent.progress >= 96) return agent;
        return { ...agent, progress: Math.min(96, agent.progress + 1) };
      }));
    }, 2600);
    return () => window.clearInterval(progressTimer);
  }, [runState]);

  useEffect(() => {
    if (runState !== "running") return;
    const moveTimer = window.setInterval(() => {
      setAgents((current) => current.map((agent) => {
        if (agent.state === "review" || agent.state === "waiting" || draggingIdRef.current === agent.id || (agent.placedUntil ?? 0) > Date.now()) return agent;
        const dx = Math.round(Math.random() * 8 - 4);
        const dy = Math.round(Math.random() * 6 - 3);
        return {
          ...agent,
          x: Math.max(13, Math.min(87, agent.x + dx)),
          y: Math.max(23, Math.min(76, agent.y + dy)),
        };
      }));
    }, 4200);
    return () => window.clearInterval(moveTimer);
  }, [runState]);

  const setProjectState = (next: RunState) => {
    setRunState(next);
    if (next === "running") {
      setAgents((current) => current.map((agent) => agent.state === "idle" ? { ...agent, state: "working", speech: "다시 작업을 시작할게요." } : agent));
      addEvent("프로젝트 실행 재개", `${agents.length}명의 에이전트가 동기화됐어요.`, "mint");
      showToast("팀이 다시 움직이기 시작했어요.");
    } else if (next === "paused") {
      addEvent("프로젝트 일시정지", "현재 컨텍스트를 보존했어요.", "amber");
      showToast("모든 작업을 안전하게 일시정지했어요.");
    } else {
      setAgents((current) => current.map((agent) => ({ ...agent, state: "idle", speech: "프로젝트가 중지됐어요.", progress: 0 })));
      addEvent("프로젝트 중지", "실행 큐를 비우고 결과물을 저장했어요.", "rose");
      showToast("프로젝트를 중지했어요.");
    }
  };

  const launchBrief = (event: FormEvent) => {
    event.preventDefault();
    if (!brief.trim()) return;
    setRunState("running");
    setAgents((current) => current.map((agent, index) => ({
      ...agent,
      state: index === 0 ? "review" : "working",
      progress: Math.max(6, Math.min(agent.progress, 18)),
      task: {
        pm: "새 브리프 범위·완료 조건 판단",
        planner: "새 브리프 기능·예외 흐름 분해",
        designer: "핵심 화면 UX 및 비주얼 설계",
        developer: "구현 구조와 컴포넌트 작업",
        qa: "인수 기준과 테스트 시나리오 설계",
        researcher: "유사 사례와 기술 리스크 조사",
      }[agent.roleKey] ?? "새 브리프 작업",
      speech: index === 0 ? "먼저 목표와 범위를 판단할게요." : "새 임무를 확인했어요!",
    })));
    addEvent("새 미션이 시작됨", brief.trim(), "blue");
    showToast("브리프를 6개 역할로 나눴어요.");
  };

  const sendInstruction = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !instruction.trim()) return;
    const text = instruction.trim();
    setAgents((current) => current.map((agent) => agent.id === selected.id ? {
      ...agent,
      task: instructionMode === "now" ? text : agent.task,
      queue: instructionMode === "checkpoint" ? [...agent.queue, text] : agent.queue,
      state: "working",
      progress: instructionMode === "now" ? Math.min(agent.progress, 12) : agent.progress,
      speech: priority === "긴급"
        ? "긴급 지시 확인! 안전 지점에서 전환할게요."
        : instructionMode === "now" ? "현재 작업 방향을 수정했어요." : "다음 체크포인트에 반영할게요.",
      logs: [{ time: now(), text: `${priority} 우선순위 지시(${instructionMode === "now" ? "즉시 수정" : "체크포인트 후"})를 받았어요: ${text}` }, ...agent.logs],
    } : agent));
    setInstruction("");
    addEvent(`${selected.name}에게 추가 지시`, `${instructionMode === "now" ? "즉시 수정" : "체크포인트 후 반영"} · ${text}`, priority === "긴급" ? "rose" : "blue");
    showToast(`${selected.name}의 ${instructionMode === "now" ? "현재 작업을 수정했어요." : "작업 큐에 추가했어요."}`);
  };

  const hireAgent = (event: FormEvent) => {
    event.preventDefault();
    if (!hireForm.name.trim()) return;
    const option = ROLE_OPTIONS.find(([label]) => label === hireForm.role) ?? ROLE_OPTIONS[1];
    const palette = [
      ["#69b7d1", "#285d79"], ["#b88ada", "#5d3e79"], ["#e49b71", "#7b4b36"], ["#77b889", "#386a4b"],
    ][agents.length % 4];
    const hireIndex = nextAgentNumber;
    const newAgent: Agent = {
      id: `hire-${hireIndex}-${hireForm.name.trim()}`,
      name: hireForm.name.trim(),
      role: option[0],
      roleKey: option[1],
      model: hireForm.model,
      state: "idle",
      task: "첫 업무 대기",
      speech: "안녕하세요! 무엇부터 할까요?",
      progress: 0,
      color: palette[0],
      accent: palette[1],
      avatar: { ...hireAvatar },
      x: 48 + ((hireIndex * 13) % 34),
      y: 48 + ((hireIndex * 9) % 25),
      completed: 0,
      queue: [],
      logs: [{ time: now(), text: "Agent Office 팀에 합류했어요." }],
    };
    setAgents((current) => [...current, newAgent]);
    setNextAgentNumber((current) => current + 1);
    selectAgent(newAgent.id);
    setDetailOpen(true);
    setHireOpen(false);
    setHireForm({ name: "", role: "UI/UX 디자이너", model: "GPT SOL" });
    setHireAvatar(avatarFrom("human-01"));
    addEvent(`${newAgent.name}님이 합류`, `${newAgent.role} · ${newAgent.model}`, "mint");
    showToast("새 직원의 자리가 준비됐어요.");
  };

  const fireSelected = () => {
    if (!selected) return;
    const name = selected.name;
    setAgents((current) => current.filter((agent) => agent.id !== selected.id));
    selectAgent(agents.find((agent) => agent.id !== selected.id)?.id ?? "");
    setConfirmFire(false);
    addEvent(`${name}님과 계약 종료`, "진행 중 컨텍스트를 보관함", "rose");
    showToast(`${name}님의 작업 기록을 보관했어요.`);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <button className="mobile-menu" onClick={() => setMobileTeamOpen((value) => !value)} aria-label="팀 목록 열기">
            <Icon name="menu" />
          </button>
          <div className="brand-gem"><span>✦</span></div>
          <div>
            <div className="brand-name">Agent Office <span>BETA</span></div>
            <p>AI 팀이 일하는 가장 투명한 방법</p>
          </div>
        </div>

        <div className="run-cluster" aria-label="프로젝트 실행 제어">
          <div className={`run-state ${runState}`}><i />{runState === "running" ? "실행 중" : runState === "paused" ? "일시정지" : "중지됨"}</div>
          <div className="segmented-controls">
            <button className={runState === "running" ? "active" : ""} onClick={() => setProjectState("running")} title="실행"><Icon name="play" size={16} /></button>
            <button className={runState === "paused" ? "active" : ""} onClick={() => setProjectState("paused")} title="일시정지"><Icon name="pause" size={16} /></button>
            <button className={runState === "stopped" ? "active danger" : ""} onClick={() => setStopConfirmOpen(true)} title="중지"><Icon name="stop" size={15} /></button>
          </div>
        </div>

        <div className="top-actions">
          <button className="icon-button notification" aria-label="알림"><Icon name="bell" /><i /></button>
          <div className="owner-avatar">GH</div>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className={`team-sidebar ${mobileTeamOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-heading">
            <div><span>MY CREW</span><strong>우리 팀</strong></div>
            <button className="add-small" onClick={() => setHireOpen(true)} aria-label="직원 고용"><Icon name="plus" size={17} /></button>
          </div>

          <div className="team-summary">
            <div className="stacked-avatars">
              {agents.slice(0, 4).map((agent) => <span key={agent.id} style={{ background: agent.avatar.primary }}>{getCharacterPreset(agent.avatar.presetId).symbol}</span>)}
            </div>
            <div><strong>{agents.length}명</strong><span>{workingCount}명 활동 중</span></div>
          </div>

          <nav className="agent-list" aria-label="에이전트 목록">
            {agents.map((agent) => (
              <button
                key={agent.id}
                className={`agent-list-item ${selectedId === agent.id ? "selected" : ""}`}
                onClick={() => { selectAgent(agent.id); setDetailOpen(true); setConfirmFire(false); setMobileTeamOpen(false); }}
              >
                <span className={`mini-avatar mini-${getCharacterPreset(agent.avatar.presetId).category}`} style={{ "--mini": agent.avatar.primary, "--mini-accent": agent.avatar.accent } as React.CSSProperties}>
                  <span>{getCharacterPreset(agent.avatar.presetId).symbol}</span><i className={agent.state} />
                </span>
                <span className="agent-list-copy"><strong>{agent.name}</strong><small>{agent.role}</small></span>
                <span className="agent-progress-mini">{agent.state === "idle" ? "—" : `${agent.progress}%`}</span>
              </button>
            ))}
          </nav>

          <button className="hire-button" onClick={() => setHireOpen(true)}><Icon name="plus" size={17} />새 직원 고용</button>

          <div className="sidebar-insight">
            <div className="insight-icon"><Icon name="spark" size={18} /></div>
            <div><strong>오늘의 생산성</strong><span>완료 18 · 판단 대기 2</span></div>
            <b>+24%</b>
          </div>
        </aside>

        <section className="center-stage">
          <form className="mission-composer" onSubmit={launchBrief}>
            <div className="composer-icon"><Icon name="spark" size={20} /></div>
            <label>
              <span>오늘 팀이 완성할 목표</span>
              <input value={brief} onChange={(event) => setBrief(event.target.value)} aria-label="프로젝트 목표" />
            </label>
            <button type="submit"><Icon name="play" size={16} />미션 실행</button>
          </form>

          <section className={`office-card ${runState}`} aria-label="가상 에이전트 사무실">
            <div className="office-toolbar">
              <div>
                <span className="live-pill"><i /> LIVE OFFICE</span>
                <strong>{currentSkin.name}</strong>
              </div>
              <div className="office-metrics">
                <span><Icon name="users" size={15} />{workingCount} working</span>
                <span><Icon name="activity" size={15} />평균 {averageProgress}%</span>
                <button className="office-tool-button" onClick={() => setSkinOpen(true)}><Icon name="map" size={14} />스킨</button>
                <button className="office-tool-button" onClick={() => selected && openCharacterStudio(selected.id)}><Icon name="palette" size={14} />캐릭터 100</button>
              </div>
            </div>

            <div
              className={`office-scene skin-${officeSkinId} ${draggingId ? "is-dragging" : ""}`}
              ref={officeSceneRef}
              style={{ backgroundImage: `linear-gradient(180deg, rgba(230,246,238,.02), rgba(35,32,46,.07)), url("${currentSkin.image}")` }}
            >
              <div className="placement-guide"><Icon name="move" size={13} /><span>캐릭터를 길게 누른 뒤 원하는 자리로 옮기세요</span></div>
              {draggingId && <div className="drag-status"><span>✦</span>원하는 자리에 놓으세요</div>}
              <div className="sunbeam sunbeam-one" /><div className="sunbeam sunbeam-two" />
              <div className="room-label label-plan">PLANNING NOOK</div>
              <div className="room-label label-design">DESIGN GARDEN</div>
              <div className="room-label label-dev">BUILD LAB</div>
              <div className="room-label label-qa">QUALITY CORNER</div>
              <div className="scene-prop meeting-table"><span /><i /><i /><i /></div>
              <div className="scene-prop rug" />
              <div className="scene-prop plant plant-a"><i /><i /><i /></div>
              <div className="scene-prop plant plant-b"><i /><i /><i /></div>
              <div className="scene-prop board"><span>SPRINT</span><i /><i /><i /></div>
              <div className="scene-prop sofa"><span /></div>
              <div className="scene-prop desk desk-a"><span>⌘</span></div>
              <div className="scene-prop desk desk-b"><span>✦</span></div>
              <div className="scene-prop desk desk-c"><span>✓</span></div>

              {runState === "paused" && <div className="paused-overlay"><span><Icon name="pause" /></span><strong>팀이 잠시 쉬고 있어요</strong><small>컨텍스트와 진행률은 안전하게 보존됩니다</small></div>}
              {runState === "stopped" && <div className="paused-overlay stopped"><span><Icon name="stop" /></span><strong>프로젝트가 중지됐어요</strong><small>실행을 누르면 새로운 작업을 시작합니다</small></div>}

              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`scene-agent ${agent.state} ${selectedId === agent.id ? "selected" : ""} ${draggingId === agent.id ? "dragging" : ""}`}
                  style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
                  onPointerDown={(event) => handleAgentPointerDown(event, agent.id)}
                  onPointerMove={(event) => handleAgentPointerMove(event, agent.id)}
                  onPointerUp={(event) => handleAgentPointerEnd(event, agent)}
                  onPointerCancel={cancelAgentPointer}
                  onLostPointerCapture={cancelAgentPointer}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    selectAgent(agent.id);
                    setDetailOpen(true);
                    setConfirmFire(false);
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  aria-label={`${agent.name}, ${agent.role}, ${stateLabel(agent.state)}`}
                >
                  <span className="hold-ring" />
                  <span className="speech-bubble"><strong>{agent.task}</strong><span>{agent.speech}</span></span>
                  <span className="thinking-dots"><i /><i /><i /></span>
                  <AgentFigure agent={agent} />
                  <span className="agent-nameplate"><strong>{agent.name}</strong><small>{stateLabel(agent.state)}</small></span>
                </button>
              ))}
            </div>
          </section>

          <section className="workflow-card">
            <div className="section-title-row">
              <div><span>ACTIVE WORKFLOW</span><strong>프로젝트 파이프라인</strong></div>
              <small>자동 핸드오프 켜짐 <i /></small>
            </div>
            <div className="workflow-track">
              {workflow.map((step, index) => (
                <div className={`workflow-step ${step.state}`} key={step.id}>
                  <div className="step-line">{index > 0 && <i />}</div>
                  <span className="step-node">{step.state === "done" ? <Icon name="check" size={15} /> : index + 1}</span>
                  <strong>{step.label}</strong><small>{step.owner}</small>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className={`detail-panel ${selected && detailOpen ? "open" : ""}`}>
          {selected ? (
            <>
              <div className="detail-head">
                <button className="detail-close" onClick={() => setDetailOpen(false)} aria-label="상세 패널 닫기"><Icon name="close" size={18} /></button>
                <button className={`hero-avatar hero-${selectedPreset?.category}`} style={{ "--mini": selected.avatar.primary, "--mini-accent": selected.avatar.accent } as React.CSSProperties} onClick={() => openCharacterStudio(selected.id)} aria-label={`${selected.name} 캐릭터 꾸미기`}>
                  <span>{selectedPreset?.symbol}</span><i className={selected.state} /><b><Icon name="palette" size={11} /></b>
                </button>
                <div className="detail-identity">
                  <h2>{selected.name}</h2>
                  <p>{selected.role} <i /> {selected.model}</p>
                </div>
                <span className={`detail-status ${selected.state}`}>{stateLabel(selected.state)}</span>
              </div>

              <div className="detail-tabs">
                <button className={detailTab === "work" ? "active" : ""} onClick={() => setDetailTab("work")}>현재 작업</button>
                <button className={detailTab === "log" ? "active" : ""} onClick={() => setDetailTab("log")}>활동 로그</button>
              </div>

              {detailTab === "work" ? (
                <div className="detail-scroll">
                  <button className="appearance-strip" onClick={() => openCharacterStudio(selected.id)}>
                    <span style={{ background: selected.avatar.primary }}>{selectedPreset?.symbol}</span>
                    <div><strong>{selectedPreset?.name}</strong><small>{selectedPreset?.categoryLabel} · {selected.avatar.accessory}</small></div>
                    <b><Icon name="palette" size={14} />꾸미기</b>
                  </button>
                  <section className="current-task-card">
                    <div className="task-card-top"><span>진행 중인 일</span><button aria-label="작업 이름 수정" onClick={() => { setInstruction(selected.task); setInstructionMode("now"); }}><Icon name="edit" size={15} /></button></div>
                    <h3>{selected.task}</h3>
                    <p>{selected.speech}</p>
                    <div className="progress-copy"><span>진행률</span><strong>{selected.progress}%</strong></div>
                    <div className="progress-bar"><i style={{ width: `${selected.progress}%`, background: selected.color }} /></div>
                    <div className="task-meta">
                      <span><Icon name="clock" size={14} />예상 18분</span>
                      <span><Icon name="check" size={14} />완료 {selected.completed}건</span>
                    </div>
                  </section>

                  <form className="instruction-card" onSubmit={sendInstruction}>
                    <div className="instruction-title"><span><Icon name="command" size={17} /></span><div><strong>추가 지시하기</strong><small>작업 중에도 방향을 수정할 수 있어요</small></div></div>
                    <div className="apply-mode" aria-label="지시 적용 시점">
                      <button type="button" className={instructionMode === "checkpoint" ? "active" : ""} onClick={() => setInstructionMode("checkpoint")}><Icon name="clock" size={13} />체크포인트 후</button>
                      <button type="button" className={instructionMode === "now" ? "active" : ""} onClick={() => setInstructionMode("now")}><Icon name="activity" size={13} />현재 작업 수정</button>
                    </div>
                    <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={`${selected.name}에게 무엇을 더 시킬까요?`} rows={3} />
                    <div className="instruction-actions">
                      <div className="priority-picker" aria-label="우선순위">
                        {(["보통", "높음", "긴급"] as Priority[]).map((item) => <button type="button" key={item} className={priority === item ? "active" : ""} onClick={() => setPriority(item)}>{item}</button>)}
                      </div>
                      <button className="send-button" type="submit" disabled={!instruction.trim()}><Icon name="send" size={15} />전달</button>
                    </div>
                  </form>

                  <section className="queue-section">
                    <div className="subheading"><strong>다음 작업</strong><span>{selected.queue.length}</span></div>
                    {selected.queue.length ? selected.queue.map((item, index) => (
                      <div className="queue-item" key={`${item}-${index}`}><span>{index + 1}</span><p>{item}</p><Icon name="chevron" size={15} /></div>
                    )) : <div className="empty-queue">대기 중인 작업이 없어요</div>}
                  </section>

                  <section className="recent-events">
                    <div className="subheading"><strong>팀 활동</strong><button onClick={() => setDetailTab("log")}>전체 보기</button></div>
                    {filteredEvents.slice(0, 3).map((event) => (
                      <div className="event-row" key={event.id}><i className={event.tone} /><div><strong>{event.title}</strong><span>{event.detail}</span></div><time>{event.time}</time></div>
                    ))}
                  </section>
                </div>
              ) : (
                <div className="detail-scroll log-view">
                  <div className="log-summary"><Icon name="activity" /><div><strong>오늘 {selected.completed}개 이벤트</strong><span>최근 작업 기록과 판단 근거</span></div></div>
                  {selected.logs.map((log, index) => <div className="log-item" key={`${log.time}-${index}`}><time>{log.time}</time><i /><p>{log.text}</p></div>)}
                </div>
              )}

              <div className="detail-footer">
                {confirmFire ? (
                  <div className="fire-confirm"><span>정말 계약을 종료할까요?</span><button onClick={() => setConfirmFire(false)}>취소</button><button className="danger" onClick={fireSelected}>해고</button></div>
                ) : (
                  <><button className="quiet-button"><Icon name="briefcase" size={15} />설정</button><button className="fire-button" onClick={() => setConfirmFire(true)}><Icon name="trash" size={15} />계약 종료</button></>
                )}
              </div>
            </>
          ) : (
            <div className="no-selection"><span><Icon name="users" /></span><strong>직원을 선택해주세요</strong><p>사무실의 캐릭터를 누르면 현재 업무와 기록을 볼 수 있어요.</p></div>
          )}
        </aside>
      </div>

      {hireOpen && !characterStudioOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setHireOpen(false); }}>
          <form className="hire-modal" onSubmit={hireAgent} role="dialog" aria-modal="true" aria-labelledby="hire-title">
            <div className="modal-gem"><Icon name="users" size={22} /></div>
            <button type="button" className="modal-close" onClick={() => setHireOpen(false)} aria-label="닫기"><Icon name="close" /></button>
            <span className="eyebrow">EXPAND YOUR CREW</span>
            <h2 id="hire-title">새 직원을 고용할까요?</h2>
            <p>역할과 모델을 고르면 바로 사무실에 합류합니다.</p>
            <label><span>직원 이름</span><input autoFocus value={hireForm.name} onChange={(event) => setHireForm({ ...hireForm, name: event.target.value })} placeholder="예: 나리" /></label>
            <div className="form-grid">
              <label><span>담당 역할</span><select value={hireForm.role} onChange={(event) => setHireForm({ ...hireForm, role: event.target.value })}>{ROLE_OPTIONS.map(([label]) => <option key={label}>{label}</option>)}</select></label>
              <label><span>연결 모델</span><select value={hireForm.model} onChange={(event) => setHireForm({ ...hireForm, model: event.target.value })}><option>GPT SOL</option><option>Qwen 3.6</option><option>Claude CLI</option><option>직접 연결</option></select></label>
            </div>
            <button type="button" className="hire-preview" onClick={() => openCharacterStudio("__hire__")}> 
              <span className="preview-avatar"><CharacterFigure avatar={hireAvatar} roleMark={getCharacterPreset(hireAvatar.presetId).symbol} /></span>
              <div><strong>{hireForm.name || "새 직원"}</strong><span>{getCharacterPreset(hireAvatar.presetId).name} · {hireForm.role}</span></div>
              <i><Icon name="palette" size={13} />캐릭터 선택</i>
            </button>
            <div className="modal-actions"><button type="button" onClick={() => setHireOpen(false)}>취소</button><button type="submit" disabled={!hireForm.name.trim()}><Icon name="plus" size={16} />직원 고용</button></div>
          </form>
        </div>
      )}

      {skinOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setSkinOpen(false); }}>
          <div className="skin-modal" role="dialog" aria-modal="true" aria-labelledby="skin-title">
            <div className="modal-heading-row">
              <div><span className="eyebrow">OFFICE COLLECTION</span><h2 id="skin-title">어디에서 일할까요?</h2><p>업무 공간과 분위기를 한 번에 바꿔보세요.</p></div>
              <button type="button" className="modal-close static" onClick={() => setSkinOpen(false)} aria-label="오피스 스킨 닫기"><Icon name="close" /></button>
            </div>
            <div className="skin-grid">
              {officeSkins.map((skin) => (
                <button
                  type="button"
                  key={skin.id}
                  className={`skin-card ${officeSkinId === skin.id ? "selected" : ""}`}
                  aria-pressed={officeSkinId === skin.id}
                  onClick={() => { setOfficeSkinId(skin.id); setSkinOpen(false); showToast(`${skin.name}(으)로 오피스를 바꿨어요.`); }}
                >
                  <span className={`skin-thumb skin-thumb-${skin.id}`} style={{ backgroundImage: `url("${skin.image}")` }}><i style={{ background: skin.palette }} />{officeSkinId === skin.id && <b><Icon name="check" size={14} /></b>}</span>
                  <span><strong>{skin.name}</strong><small>{skin.subtitle}</small></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {characterStudioOpen && (
        <div className="modal-backdrop studio-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCharacterStudioOpen(false); }}>
          <div className="character-studio" role="dialog" aria-modal="true" aria-labelledby="studio-title">
            <header className="studio-header">
              <div><span className="eyebrow">CHARACTER ATELIER · 100 PRESETS</span><h2 id="studio-title">캐릭터를 골라 꾸며보세요</h2><p>{studioTargetId === "__hire__" ? "새 직원" : studioTarget?.name}의 모습은 언제든 다시 바꿀 수 있어요.</p></div>
              <button type="button" className="modal-close static" onClick={() => setCharacterStudioOpen(false)} aria-label="캐릭터 스튜디오 닫기"><Icon name="close" /></button>
            </header>

            <div className="catalog-toolbar">
              <div className="category-tabs">
                {categoryMeta.map((category) => <button type="button" key={category.id} className={characterCategory === category.id ? "active" : ""} onClick={() => setCharacterCategory(category.id)}><span>{category.icon}</span>{category.label}</button>)}
              </div>
              <label className="character-search"><Icon name="search" size={15} /><input value={characterSearch} onChange={(event) => setCharacterSearch(event.target.value)} placeholder="캐릭터 검색" /><span>{visiblePresets.length}</span></label>
            </div>

            <div className="studio-layout">
              <section className="character-catalog" aria-label="캐릭터 프리셋 목록">
                <div className="character-grid">
                  {visiblePresets.map((preset) => {
                    const presetAvatar = avatarFrom(preset.id);
                    return (
                      <button
                        type="button"
                        key={preset.id}
                        className={`character-card ${studioDraft.presetId === preset.id ? "selected" : ""}`}
                        aria-pressed={studioDraft.presetId === preset.id}
                        onClick={() => setStudioDraft((current) => ({ ...current, presetId: preset.id, primary: preset.primary, accent: preset.accent, skin: preset.skin, accessory: preset.defaultAccessory }))}
                        aria-label={`${preset.name} 선택`}
                      >
                        <span className="card-character"><CharacterFigure avatar={presetAvatar} roleMark={preset.symbol} /></span>
                        <span className="card-name"><strong>{preset.name}</strong><small>{preset.categoryLabel}</small></span>
                        {studioDraft.presetId === preset.id && <i><Icon name="check" size={12} /></i>}
                      </button>
                    );
                  })}
                </div>
                {!visiblePresets.length && <div className="catalog-empty"><Icon name="search" /><strong>검색 결과가 없어요</strong><span>다른 이름이나 카테고리를 선택해보세요.</span></div>}
              </section>

              <aside className="customizer-panel">
                <div className={`customizer-preview preview-${studioPreset.category}`}>
                  <span className="preview-floor" />
                  <CharacterFigure avatar={studioDraft} roleKey={studioTarget?.roleKey} roleMark={studioTarget ? (studioTarget.role === "판단 PM" ? "◆" : studioTarget.role.charAt(0)) : studioPreset.symbol} />
                  <span className="preview-name"><strong>{studioPreset.name}</strong><small>{studioPreset.categoryLabel} · {studioDraft.accessory}</small></span>
                </div>

                <div className="customizer-scroll">
                  <section className="custom-control"><div className="control-heading"><strong>메인 컬러</strong><input type="color" value={studioDraft.primary} onChange={(event) => setStudioDraft({ ...studioDraft, primary: event.target.value })} aria-label="캐릭터 메인 컬러" /></div><div className="color-swatches">{AVATAR_SWATCHES.map((color) => <button type="button" key={color} onClick={() => setStudioDraft({ ...studioDraft, primary: color })} className={studioDraft.primary === color ? "active" : ""} style={{ background: color }} aria-label={`${color} 컬러`} />)}</div></section>
                  <section className="custom-control"><div className="control-heading"><strong>보조 컬러</strong><input type="color" value={studioDraft.accent} onChange={(event) => setStudioDraft({ ...studioDraft, accent: event.target.value })} aria-label="캐릭터 보조 컬러" /></div><div className="color-swatches">{AVATAR_SWATCHES.slice().reverse().map((color) => <button type="button" key={color} onClick={() => setStudioDraft({ ...studioDraft, accent: color })} className={studioDraft.accent === color ? "active" : ""} style={{ background: color }} aria-label={`${color} 보조 컬러`} />)}</div></section>
                  <label className="custom-control select-control"><span>액세서리</span><select value={studioDraft.accessory} onChange={(event) => setStudioDraft({ ...studioDraft, accessory: event.target.value })}>{ACCESSORY_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <section className="custom-control"><div className="control-heading"><strong>표정</strong><span>{studioDraft.expression === "happy" ? "밝게" : studioDraft.expression === "focused" ? "집중" : "시크"}</span></div><div className="expression-picker"><button type="button" className={studioDraft.expression === "happy" ? "active" : ""} onClick={() => setStudioDraft({ ...studioDraft, expression: "happy" })}>◡ 밝게</button><button type="button" className={studioDraft.expression === "focused" ? "active" : ""} onClick={() => setStudioDraft({ ...studioDraft, expression: "focused" })}>• 집중</button><button type="button" className={studioDraft.expression === "cool" ? "active" : ""} onClick={() => setStudioDraft({ ...studioDraft, expression: "cool" })}>⌐ 시크</button></div></section>
                  <label className="custom-control range-control"><span><strong>크기</strong><b>{Math.round(studioDraft.scale * 100)}%</b></span><input type="range" min="0.82" max="1.2" step="0.02" value={studioDraft.scale} onChange={(event) => setStudioDraft({ ...studioDraft, scale: Number(event.target.value) })} /></label>
                </div>

                <div className="studio-actions"><button type="button" onClick={() => setCharacterStudioOpen(false)}>취소</button><button type="button" onClick={applyCharacterStudio}><Icon name="spark" size={15} />이 캐릭터로 적용</button></div>
              </aside>
            </div>
          </div>
        </div>
      )}

      {stopConfirmOpen && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setStopConfirmOpen(false); }}>
          <div className="stop-modal" role="dialog" aria-modal="true" aria-labelledby="stop-title">
            <div className="stop-icon"><Icon name="stop" size={21} /></div>
            <span className="eyebrow">SAFE STOP</span>
            <h2 id="stop-title">프로젝트를 중지할까요?</h2>
            <p>진행 중인 작업 {workingCount}개는 취소되지만, 지금까지 만든 결과물과 활동 로그는 그대로 보존됩니다.</p>
            <div className="stop-note"><Icon name="check" size={15} /><span>마지막 안전 체크포인트가 자동으로 저장됩니다.</span></div>
            <div className="modal-actions"><button type="button" onClick={() => setStopConfirmOpen(false)}>계속 실행</button><button className="stop-confirm-button" type="button" onClick={() => { setStopConfirmOpen(false); setProjectState("stopped"); }}><Icon name="stop" size={15} />중지하기</button></div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span><Icon name="check" size={15} /></span>{toast}</div>}
    </main>
  );
}
