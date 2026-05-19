import { useEffect, useState } from 'react';
import type {
  AccessoryId,
  BackgroundId,
  CharacterAppearance,
  HairStyle,
  OutfitId,
  SkinTone,
} from '../types';
import { cn } from '../lib/utils';

interface Props {
  appearance: CharacterAppearance;
  size?: number;
  speaking?: boolean;
  className?: string;
  hideBackground?: boolean;
  expression?: 'happy' | 'neutral';
}

const SKIN: Record<SkinTone, { face: string; shadow: string }> = {
  light: { face: '#fde2c8', shadow: '#e8c9a5' },
  tan:   { face: '#dfb593', shadow: '#bf9573' },
  rosy:  { face: '#fbc8b4', shadow: '#e0a895' },
};

const OUTFIT: Record<OutfitId, { main: string; trim: string; collar?: string }> = {
  hanbok_pink:   { main: '#f4a8b8', trim: '#d3637a', collar: '#fff5f5' },
  hanbok_blue:   { main: '#8db9d9', trim: '#4e7fa0', collar: '#f0f6fb' },
  cardigan_warm: { main: '#d9b78a', trim: '#a3895f' },
  sweater_brown: { main: '#7a553a', trim: '#553a26' },
  shirt_white:   { main: '#f5f5f5', trim: '#c8c8c8', collar: '#fff' },
};

const BG: Record<BackgroundId, { from: string; to: string }> = {
  cream:       { from: '#fffaf3', to: '#fce6cf' },
  garden:      { from: '#d6eecd', to: '#f3e0a8' },
  sunset:      { from: '#fbc5a4', to: '#f7969c' },
  living_room: { from: '#efe4d3', to: '#d6c3a8' },
};

export function ElderCharacter({
  appearance,
  size = 220,
  speaking = false,
  className,
  hideBackground = false,
  expression = 'happy',
}: Props) {
  // 입 애니메이션 — 말하는 중일 때 200ms 간격으로 토글
  const [mouthOpen, setMouthOpen] = useState(false);

  useEffect(() => {
    if (!speaking) {
      setMouthOpen(false);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setMouthOpen((m) => !m);
    };
    const id = window.setInterval(tick, 180);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [speaking]);

  const skin = SKIN[appearance.skin];
  const outfit = OUTFIT[appearance.outfit];

  return (
    <svg
      viewBox="0 0 200 240"
      width={size}
      height={(size * 240) / 200}
      className={cn(speaking ? 'animate-gentle-bounce' : '', className)}
      aria-hidden="true"
    >
      {/* 배경 */}
      {!hideBackground ? <Background id={appearance.background} /> : null}

      {/* 본체 그룹 — 미세하게 숨쉬듯 흔들림 */}
      <g style={{ transformOrigin: '100px 130px' }}>
        {/* 몸통 (옷) */}
        <Outfit id={appearance.outfit} colors={outfit} />

        {/* 목 */}
        <rect x="88" y="100" width="24" height="22" rx="6" fill={skin.shadow} />

        {/* 머리 */}
        <g>
          {/* 얼굴 */}
          <ellipse cx="100" cy="80" rx="38" ry="42" fill={skin.face} />
          {/* 볼터치 (분홍 살결일 때 더 진하게) */}
          {appearance.skin === 'rosy' ? (
            <>
              <circle cx="76" cy="92" r="6" fill="#f0a0a0" opacity="0.5" />
              <circle cx="124" cy="92" r="6" fill="#f0a0a0" opacity="0.5" />
            </>
          ) : (
            <>
              <circle cx="76" cy="92" r="5" fill="#f4b8a8" opacity="0.35" />
              <circle cx="124" cy="92" r="5" fill="#f4b8a8" opacity="0.35" />
            </>
          )}

          {/* 눈 */}
          {expression === 'happy' ? (
            <>
              <path
                d="M 80 78 Q 86 73 92 78"
                stroke="#3a2a1a"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M 108 78 Q 114 73 120 78"
                stroke="#3a2a1a"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <ellipse cx="86" cy="78" rx="2.2" ry="3" fill="#3a2a1a" />
              <ellipse cx="114" cy="78" rx="2.2" ry="3" fill="#3a2a1a" />
            </>
          )}

          {/* 입 — 말할 때 변화 */}
          {mouthOpen ? (
            <ellipse cx="100" cy="100" rx="6" ry="5" fill="#9c4d4d" />
          ) : (
            <path
              d="M 92 100 Q 100 105 108 100"
              stroke="#9c4d4d"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* 머리카락 */}
          <Hair style={appearance.hair} />

          {/* 액세서리 */}
          <Accessory id={appearance.accessory} />
        </g>

        {/* 손 */}
        <circle cx="58" cy="170" r="9" fill={skin.face} />
        <circle cx="142" cy="170" r="9" fill={skin.face} />
      </g>
    </svg>
  );
}

function Background({ id }: { id: BackgroundId }) {
  const { from, to } = BG[id];
  return (
    <>
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="200" height="240" fill={`url(#bg-${id})`} />
      {id === 'garden' ? (
        <>
          <circle cx="30" cy="200" r="14" fill="#f9c5ce" opacity="0.7" />
          <circle cx="170" cy="210" r="11" fill="#f6e58c" opacity="0.8" />
          <circle cx="180" cy="175" r="8" fill="#c7e5b0" opacity="0.7" />
        </>
      ) : null}
      {id === 'sunset' ? (
        <circle cx="155" cy="60" r="22" fill="#ffd2a4" opacity="0.85" />
      ) : null}
    </>
  );
}

function Outfit({
  id,
  colors,
}: {
  id: OutfitId;
  colors: { main: string; trim: string; collar?: string };
}) {
  // 한복: 어깨 넓고 V자 깃
  if (id === 'hanbok_pink' || id === 'hanbok_blue') {
    return (
      <>
        <path
          d="M 40 240 L 50 140 Q 100 110 150 140 L 160 240 Z"
          fill={colors.main}
        />
        {/* 깃 */}
        <path
          d="M 78 118 L 100 145 L 122 118 L 122 130 L 100 158 L 78 130 Z"
          fill={colors.collar || '#fff'}
          stroke={colors.trim}
          strokeWidth="1.5"
        />
        {/* 끈 */}
        <rect x="98" y="148" width="4" height="40" fill={colors.trim} rx="1" />
      </>
    );
  }
  // 가디건 / 스웨터 / 셔츠
  return (
    <>
      <path
        d="M 48 240 L 56 140 Q 100 115 144 140 L 152 240 Z"
        fill={colors.main}
      />
      {/* V넥 */}
      <path
        d="M 86 118 L 100 145 L 114 118 Z"
        fill={colors.collar || colors.trim}
        stroke={colors.trim}
        strokeWidth="1"
      />
      {/* 단추 */}
      {id === 'cardigan_warm' ? (
        <>
          <circle cx="100" cy="170" r="2.5" fill={colors.trim} />
          <circle cx="100" cy="190" r="2.5" fill={colors.trim} />
          <circle cx="100" cy="210" r="2.5" fill={colors.trim} />
        </>
      ) : null}
    </>
  );
}

function Hair({ style }: { style: HairStyle }) {
  switch (style) {
    case 'short_gray':
      return (
        <path
          d="M 64 60 Q 68 38 100 36 Q 132 38 136 60 Q 140 76 132 72 Q 100 60 68 72 Q 60 76 64 60 Z"
          fill="#9aa0a6"
        />
      );
    case 'permed_gray':
      return (
        <g fill="#b7b8bb">
          <circle cx="72" cy="56" r="12" />
          <circle cx="86" cy="46" r="13" />
          <circle cx="100" cy="42" r="14" />
          <circle cx="114" cy="46" r="13" />
          <circle cx="128" cy="56" r="12" />
          <circle cx="68" cy="72" r="9" />
          <circle cx="132" cy="72" r="9" />
        </g>
      );
    case 'short_black':
      return (
        <path
          d="M 62 64 Q 64 36 100 32 Q 136 36 138 64 Q 140 78 132 70 Q 100 55 68 70 Q 60 78 62 64 Z"
          fill="#2a2017"
        />
      );
    case 'permed_white':
      return (
        <g fill="#f1f0ee">
          <circle cx="72" cy="56" r="13" />
          <circle cx="88" cy="44" r="14" />
          <circle cx="100" cy="40" r="15" />
          <circle cx="112" cy="44" r="14" />
          <circle cx="128" cy="56" r="13" />
          <circle cx="66" cy="74" r="9" />
          <circle cx="134" cy="74" r="9" />
        </g>
      );
    case 'bald':
      return (
        <path
          d="M 68 70 Q 72 60 100 58 Q 128 60 132 70 Q 134 72 130 72 Q 100 66 70 72 Q 66 72 68 70 Z"
          fill="#e1cab0"
          opacity="0.7"
        />
      );
  }
}

function Accessory({ id }: { id: AccessoryId }) {
  switch (id) {
    case 'glasses':
      return (
        <g stroke="#2a2017" strokeWidth="2" fill="none">
          <circle cx="86" cy="80" r="8" fill="#ffffff60" />
          <circle cx="114" cy="80" r="8" fill="#ffffff60" />
          <line x1="94" y1="80" x2="106" y2="80" />
        </g>
      );
    case 'reading_glasses':
      return (
        <g stroke="#c87436" strokeWidth="2.5" fill="none">
          <rect x="76" y="74" width="20" height="13" rx="2" fill="#ffffff60" />
          <rect x="104" y="74" width="20" height="13" rx="2" fill="#ffffff60" />
          <line x1="96" y1="80" x2="104" y2="80" />
        </g>
      );
    case 'flower_pin':
      return (
        <g>
          <circle cx="78" cy="48" r="3.5" fill="#f8a3c0" />
          <circle cx="73" cy="44" r="3" fill="#f8a3c0" />
          <circle cx="73" cy="52" r="3" fill="#f8a3c0" />
          <circle cx="82" cy="44" r="3" fill="#f8a3c0" />
          <circle cx="82" cy="52" r="3" fill="#f8a3c0" />
          <circle cx="78" cy="48" r="2" fill="#f4d36a" />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path
            d="M 70 120 Q 100 132 130 120 L 134 144 Q 100 152 66 144 Z"
            fill="#c97a7e"
            stroke="#8a4d50"
            strokeWidth="1"
          />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}
