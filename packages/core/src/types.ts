export interface Guardian {
  name: string;
  relation: string; // 아들, 딸, 며느리 등
  phone?: string;
}

// ─── 캐릭터 꾸미기 시스템 (v2) ────────────────────────────────
export type SkinTone   = 'light' | 'tan' | 'rosy';
export type HairStyle  = 'short_gray' | 'permed_gray' | 'short_black' | 'permed_white' | 'bald';
export type OutfitId   = 'hanbok_pink' | 'hanbok_blue' | 'cardigan_warm' | 'sweater_brown' | 'shirt_white';
export type AccessoryId = 'none' | 'glasses' | 'reading_glasses' | 'flower_pin' | 'scarf';
export type BackgroundId = 'cream' | 'garden' | 'sunset' | 'living_room';

export interface CharacterAppearance {
  skin: SkinTone;
  hair: HairStyle;
  outfit: OutfitId;
  accessory: AccessoryId;
  background: BackgroundId;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  skin: 'light',
  hair: 'permed_gray',
  outfit: 'hanbok_pink',
  accessory: 'none',
  background: 'cream',
};

// 어르신이 캐릭터를 한 번도 꾸미지 않았는지 확인 (전부 기본값과 동일)
export function isDefaultAppearance(a: CharacterAppearance): boolean {
  return (
    a.skin === DEFAULT_APPEARANCE.skin &&
    a.hair === DEFAULT_APPEARANCE.hair &&
    a.outfit === DEFAULT_APPEARANCE.outfit &&
    a.accessory === DEFAULT_APPEARANCE.accessory &&
    a.background === DEFAULT_APPEARANCE.background
  );
}

export interface AppearanceOptionMeta<T extends string> {
  id: T;
  label: string;
  preview?: string; // 이모지 or 짧은 라벨
}

export const SKIN_OPTIONS: AppearanceOptionMeta<SkinTone>[] = [
  { id: 'light', label: '밝은 살결', preview: '🌝' },
  { id: 'tan',   label: '구릿빛',   preview: '🌗' },
  { id: 'rosy',  label: '발그레',   preview: '🌸' },
];

export const HAIR_OPTIONS: AppearanceOptionMeta<HairStyle>[] = [
  { id: 'short_gray',    label: '단발 회색',  preview: '👵' },
  { id: 'permed_gray',   label: '뽀글 회색',  preview: '👵🏻' },
  { id: 'short_black',   label: '단발 검정',  preview: '👨' },
  { id: 'permed_white',  label: '백발 뽀글',  preview: '👴' },
  { id: 'bald',          label: '대머리',     preview: '👴🏼' },
];

export const OUTFIT_OPTIONS: AppearanceOptionMeta<OutfitId>[] = [
  { id: 'hanbok_pink',   label: '분홍 한복',   preview: '🌸' },
  { id: 'hanbok_blue',   label: '하늘 한복',   preview: '💙' },
  { id: 'cardigan_warm', label: '베이지 가디건', preview: '🧥' },
  { id: 'sweater_brown', label: '갈색 스웨터', preview: '🟫' },
  { id: 'shirt_white',   label: '흰 셔츠',     preview: '👔' },
];

export const ACCESSORY_OPTIONS: AppearanceOptionMeta<AccessoryId>[] = [
  { id: 'none',            label: '없음' },
  { id: 'glasses',         label: '안경',        preview: '👓' },
  { id: 'reading_glasses', label: '돋보기',      preview: '🤓' },
  { id: 'flower_pin',      label: '꽃 머리핀',   preview: '🌺' },
  { id: 'scarf',           label: '스카프',      preview: '🧣' },
];

export const BACKGROUND_OPTIONS: AppearanceOptionMeta<BackgroundId>[] = [
  { id: 'cream',       label: '크림 배경' },
  { id: 'garden',      label: '정원' },
  { id: 'sunset',      label: '노을' },
  { id: 'living_room', label: '거실' },
];

/** 어르신 성별 — DB enum(elder_gender)과 1:1. 표기 문구는 화면에서 매핑. */
export type ElderGender = 'female' | 'male';

export interface ElderProfile {
  id: string;
  name: string;
  /**
   * 출생연도. `birthDate` 가 있으면 그 연도와 항상 같다(DB 제약으로 강제).
   * 월·일을 모르는 기존 데이터가 있어 연도만 따로 보관한다.
   */
  birthYear: number;
  /**
   * 생년월일 `YYYY-MM-DD`. 폼 입력의 단일 근거.
   * 월·일이 입력되지 않았으면 undefined — 화면은 연도만 표기한다(임의값 금지).
   */
  birthDate?: string;
  hometown?: string;
  job?: string;
  family?: string;
  hobbies?: string;
  avatarColor: string;
  /**
   * 어르신 사진의 Storage 경로(`<profile_id>/<uuid>.<ext>`, private 버킷 elder-photos).
   * 공개 URL 이 아니므로 표시 시 signed URL 로 변환한다. 없으면 이니셜 아바타로 대체.
   */
  photoPath?: string;
  /** 성별(선택). 미입력 시 화면에서 표기를 생략한다(임의값 표시 금지). */
  gender?: ElderGender;
  guardian?: Guardian;
  appearance: CharacterAppearance;
  createdAt: string;
  updatedAt: string;
}

// v1은 'reminiscence'(회상 대화)만 사용. cognitive/music/art는 v2.
export type TherapyType = 'reminiscence' | 'cognitive' | 'music' | 'art';

export interface TherapyTypeMeta {
  type: TherapyType;
  label: string;
  shortLabel: string;
  description: string;
  emoji: string;
  gradient: string;         // Tailwind classes
  ringColor: string;        // Tailwind classes
}

export const THERAPY_TYPES: Record<TherapyType, TherapyTypeMeta> = {
  reminiscence: {
    type: 'reminiscence',
    label: '회상 대화',
    shortLabel: '회상',
    description: '어르신의 고향·가족·추억을 자연스럽게 끌어내는 대화',
    emoji: '🌸',
    gradient: 'from-warm-200 via-warm-100 to-cream-100',
    ringColor: 'ring-warm-400',
  },
  cognitive: {
    type: 'cognitive',
    label: '인지자극',
    shortLabel: '인지',
    description: '쉬운 퀴즈와 단어 놀이로 가벼운 두뇌 활동',
    emoji: '🧩',
    gradient: 'from-sky-100 via-sky-50 to-cream-100',
    ringColor: 'ring-sky-400',
  },
  music: {
    type: 'music',
    label: '음악감상',
    shortLabel: '음악',
    description: '옛 노래를 떠올리고 추억과 연결',
    emoji: '🎵',
    gradient: 'from-rose-100 via-pink-50 to-cream-100',
    ringColor: 'ring-rose-400',
  },
  art: {
    type: 'art',
    label: '미술회상',
    shortLabel: '미술',
    description: '그림·풍경 묘사로 상상력 자극',
    emoji: '🎨',
    gradient: 'from-emerald-100 via-emerald-50 to-cream-100',
    ringColor: 'ring-emerald-400',
  },
};

export interface Session {
  id: string;
  title: string;
  therapyType: TherapyType;
  note?: string;          // 요양보호사 메모
  durationMinutes: number;
  elderId: string;
  createdAt: string;
  updatedAt: string;
}

export type ChronicleSource = 'AI' | 'Caregiver';

export interface ChronicleEntry {
  id: string;
  elderId: string;
  topic: string;
  /** 사람이 붙인 제목(최대 50자). AI 가 모은 항목·구 데이터는 없다 → 화면은 content 로 대체. */
  title?: string;
  content: string;
  keywords: string[];
  source: ChronicleSource;
  recordedAt: string;
  updatedAt: string;
}

export type Speaker = 'AI' | 'Elderly' | 'Caregiver';

export interface ConversationTurn {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: string;
  /**
   * 요양보호사가 고치기 **전** STT 원문(고치지 않았으면 undefined).
   * DB `session_logs.original_content` 와 1:1 — 어떤 발화가 보정됐는지의 근거를 남긴다.
   * (DB 제약상 어르신 턴에만 존재할 수 있다.)
   */
  originalText?: string;
  topic?: string;
  extractedKeywords?: string[];
}

/**
 * 세션 상태. `planned` = 요양보호사가 웹에서 설계만 해 둔 상태(앱이 시작하면 active).
 * 대화 기록(ConversationLog)에는 planned 가 올 수 있다 — 아직 턴이 없는 설계 행이다.
 */
export type ConversationStatus = 'planned' | 'active' | 'ended';

export type EmotionTone = 'bright' | 'calm' | 'longing' | 'mixed' | 'quiet';

export const EMOTION_META: Record<EmotionTone, { label: string; emoji: string; color: string }> = {
  bright:  { label: '밝음',     emoji: '😊', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  calm:    { label: '차분함',   emoji: '🌿', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  longing: { label: '그리움',   emoji: '🌙', color: 'text-violet-700 bg-violet-50 border-violet-200' },
  mixed:   { label: '잔잔함',   emoji: '🪞', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  quiet:   { label: '말수 적음', emoji: '🤍', color: 'text-slate-700 bg-slate-50 border-slate-200' },
};

export interface GuardianReport {
  emotionTone: EmotionTone;
  headline: string;
  body: string;
  highlightTopics: string[];
  newChronicleCount: number;
}

export interface ConversationLog {
  id: string;
  sessionId: string;
  elderId: string;
  therapyType: TherapyType;
  turns: ConversationTurn[];
  status: ConversationStatus;
  startedAt: string;
  endedAt?: string;
  chronicleEntriesAdded: string[];
  guardianReport?: GuardianReport;
}
