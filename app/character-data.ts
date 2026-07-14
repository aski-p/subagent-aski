export type CharacterCategory = "human" | "animal" | "fantasy" | "robot";

export type CharacterPreset = {
  id: string;
  name: string;
  category: CharacterCategory;
  categoryLabel: string;
  symbol: string;
  primary: string;
  accent: string;
  skin: string;
  variant: number;
  defaultAccessory: string;
};

export type OfficeSkin = {
  id: string;
  name: string;
  subtitle: string;
  image: string;
  palette: string;
  locked?: boolean;
};

const palettes = [
  ["#59b69f", "#1f615d", "#efbd91"],
  ["#6e9ee2", "#304f89", "#d99b72"],
  ["#dc7fa5", "#813f69", "#f0bd94"],
  ["#e5b852", "#795827", "#b87655"],
  ["#9c80d8", "#573f83", "#d89a73"],
  ["#e88968", "#854838", "#efc19b"],
  ["#7dbd72", "#3f7042", "#9f674f"],
  ["#57a7c7", "#285d78", "#f2c6a2"],
  ["#d47d7d", "#7a3d48", "#c88764"],
  ["#a8b751", "#52662e", "#e7b88e"],
] as const;

const categorySource: Record<CharacterCategory, { label: string; names: string[]; symbols: string[]; accessories: string[] }> = {
  human: {
    label: "인간",
    names: ["모험가", "왕실 기사", "별빛 마법사", "숲 궁수", "연금술사", "탐정", "파티시에", "비행사", "정비사", "벽화가", "교수", "그림자 무도가", "유적 탐험가", "왕립 사서", "거리 음악가", "의무관", "대항해 선장", "천문학자", "정원사", "발명가", "우편 기사", "사진가", "건축가", "사막 여행자", "눈꽃 순찰자"],
    symbols: ["⚔", "♜", "✦", "➶", "⚗", "⌕", "♨", "✈", "⚙", "✎", "⌘", "◈", "⌖", "▤", "♫", "+", "⚓", "☄", "❀", "⚒", "✉", "◉", "△", "☀", "❄"],
    accessories: ["망토", "왕관", "마법모자", "고글", "안경"],
  },
  animal: {
    label: "동물",
    names: ["치즈 고양이", "보더콜리", "붉은 여우", "구름 토끼", "꿀곰", "대나무 판다", "수달 기사", "라쿤 상인", "달빛 늑대", "황금 사자", "꼬마 호랑이", "코알라", "햄스터", "다람쥐", "황제 펭귄", "현자 부엉이", "푸른 독수리", "노란 오리", "초록 개구리", "카피바라", "아기 코끼리", "기린", "꽃사슴", "초식 공룡", "문어 박사"],
    symbols: ["🐱", "🐶", "🦊", "🐰", "🐻", "🐼", "🦦", "🦝", "🐺", "🦁", "🐯", "🐨", "🐹", "🐿", "🐧", "🦉", "🦅", "🦆", "🐸", "🦫", "🐘", "🦒", "🦌", "🦕", "🐙"],
    accessories: ["목도리", "안경", "헤드셋", "배낭", "리본"],
  },
  fantasy: {
    label: "게임 판타지",
    names: ["민트 슬라임", "고대 나무정령", "구름 요정", "불꽃 정령", "물방울 정령", "산호 골렘", "버섯 친구", "꼬마 드래곤", "별의 수호자", "룬 기사", "수정 마법사", "숲 파수꾼", "바다 현자", "천공 정찰자", "그림자 도적", "빛의 사제", "시간술사", "폭풍 소환사", "용암 대장장이", "빙결 궁수", "꿈 수집가", "보물 사냥꾼", "포션 마스터", "태엽 연금술사", "차원 여행자"],
    symbols: ["●", "♣", "☁", "♨", "◉", "⬟", "♠", "◆", "★", "ᚱ", "◇", "♧", "≈", "☼", "◐", "✧", "⌛", "ϟ", "♨", "❄", "☾", "♛", "⚗", "⚙", "◎"],
    accessories: ["수정관", "작은 날개", "뿔", "마법책", "오라"],
  },
  robot: {
    label: "로봇",
    names: ["픽셀 비서", "큐브 메이트", "라운드 봇", "아틀라스 미니", "네온 드로이드", "청소 로버", "메일 봇", "QA 프로브", "데이터 스카우트", "리듬 유닛", "가드 봇", "메디 봇", "플랜트 로버", "코드 드로이드", "드로잉 암", "스팀 오토마톤", "홀로 비서", "문 워커", "딥시 로버", "팩토리 미니", "윈드 터빈 봇", "프리즘 유닛", "폴라 봇", "링크 드로이드", "오메가 포켓"],
    symbols: ["▦", "⬡", "◉", "A", "N", "↻", "✉", "✓", "⌁", "♫", "⌂", "+", "♣", "</>", "✎", "⚙", "H", "☾", "≈", "F", "↯", "◇", "❄", "∞", "Ω"],
    accessories: ["안테나", "헤드셋", "홀로링", "툴암", "제트팩"],
  },
};

export const categoryMeta: Array<{ id: "all" | CharacterCategory; label: string; icon: string }> = [
  { id: "all", label: "전체 100", icon: "✦" },
  { id: "human", label: "인간 25", icon: "♙" },
  { id: "animal", label: "동물 25", icon: "🐾" },
  { id: "fantasy", label: "게임 판타지 25", icon: "◆" },
  { id: "robot", label: "로봇 25", icon: "⚙" },
];

export const characterPresets: CharacterPreset[] = (Object.keys(categorySource) as CharacterCategory[]).flatMap((category) => {
  const source = categorySource[category];
  return source.names.map((name, index) => {
    const palette = palettes[(index + (category === "animal" ? 2 : category === "fantasy" ? 4 : category === "robot" ? 6 : 0)) % palettes.length];
    return {
      id: `${category}-${String(index + 1).padStart(2, "0")}`,
      name,
      category,
      categoryLabel: source.label,
      symbol: source.symbols[index],
      primary: palette[0],
      accent: palette[1],
      skin: category === "robot" ? "#bdd8d3" : palette[2],
      variant: index,
      defaultAccessory: source.accessories[index % source.accessories.length],
    };
  });
});

export const officeSkins: OfficeSkin[] = [
  { id: "garden", name: "바람숲 스튜디오", subtitle: "햇살과 식물이 가득한 기본 오피스", image: "/office-bg.webp", palette: "#55a18b" },
  { id: "guild", name: "룬 길드 본사", subtitle: "책상 12개가 있는 판타지 길드", image: "/office-skins/guild-office.webp", palette: "#c38a48" },
  { id: "cyber", name: "네온 코어 랩", subtitle: "홀로그램으로 일하는 미래 연구소", image: "/office-skins/cyber-office.webp", palette: "#756ee8" },
  { id: "sky", name: "구름 성채", subtitle: "하늘 위에 떠 있는 개방형 오피스", image: "/office-skins/sky-office.webp", palette: "#75b8db" },
  { id: "space", name: "오비탈 커맨드", subtitle: "행성을 바라보는 우주정거장 본사", image: "/office-skins/space-office.webp", palette: "#e5834e" },
  { id: "night", name: "달빛 야근실", subtitle: "바람숲의 차분한 야간 버전", image: "/office-bg.webp", palette: "#52659b" },
];

export function getCharacterPreset(id: string) {
  return characterPresets.find((preset) => preset.id === id) ?? characterPresets[0];
}
