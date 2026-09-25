// 보호자 상세 화면(요양일지 50:1102 · 대화 요약 55:1258) 공용 골격.
// 두 화면의 머리 부분과 카드 안 리듬이 완전히 같다 — 실측:
//   돌아가기 chevron 12.18×18.73 @(322,190) · 라벨 SemiBold 20/24 @(343,187.14)
//   배지 35 @(343,260) · 배지 라벨 @(362,266.2) · 날짜 @(배지오른쪽+19,264.2)
//   제목 Bold 25/70 @(362,292) · 담당 요양보호사 줄 @(362,356.27)
//   카드 1054 @(322,432.33) · 안쪽 좌우 여백 86 · 첫 제목까지 46.67
// ⚠️ Figma 는 섹션 간격을 화면마다 다르게 흘려 놨다 → 각 화면이 자기 간격을 넘긴다.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { dateDotTime } from '@giokon/core';
import { asset } from '../assets/ui';
import { Badge, type BadgeTone } from './ui/Badge';
import { Y } from '../lib/figmaY';

// 보호자 상세 화면들이 이 경로로 쓰던 좌표 변환 — 정의는 `lib/figmaY` 하나.
export { Y };

export const CARD_TOP = 432.33;
/** 본문 줄높이(Figma 28.021). */
export const LINE = 28.021;
/** 제목 상자(Bold 25/70) top → 바로 아래 본문 top. */
export const BODY_DY = 64.46;
/** 카드 안쪽 좌우 여백 — 408 − 322. */
export const PAD_X = 86;
/** 카드 top → 첫 제목 상자 top. */
export const PAD_TOP = 46.67;

export function BackLink({ to }: { to: string }) {
  return (
    <>
      <Link
        to={to}
        data-fx="50:1078"
        className="absolute whitespace-nowrap text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 343, top: Y(187.14) }}
      >
        돌아가기
      </Link>
      <img
        src={asset.iconChevronRightSm}
        alt=""
        data-fx="50:1079"
        aria-hidden
        className="pointer-events-none absolute block rotate-180"
        style={{ left: 322, top: Y(190), width: 12.18, height: 18.73 }}
      />
    </>
  );
}

/** 배지 + 날짜 + 제목 + 담당 요양보호사 줄. */
export function DetailHead({
  fx, badge, tone, badgeW, at, title,
}: {
  fx: { badge: string; label: string; at: string; title: string; author: string };
  badge: string;
  tone: BadgeTone;
  badgeW: number;
  at: string;
  title: string;
}) {
  return (
    <>
      <Badge data-fx={fx.badge} tone={tone} tag className="absolute" style={{ left: 343, top: Y(260), width: badgeW }}>
        <span data-fx={fx.label}>{badge}</span>
      </Badge>
      <span
        data-fx={fx.at}
        className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-500"
        style={{ left: 343 + badgeW + 19, top: Y(264.2) }}
      >
        {dateDotTime(at)}
      </span>
      <h1
        data-fx={fx.title}
        className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        style={{ left: 362, top: Y(292) }}
      >
        {title}
      </h1>
      <p
        data-fx={fx.author}
        className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-700"
        style={{ left: 362, top: Y(356.27) }}
      >
        {/* 담당 요양보호사의 이름은 보호자 권한으로 읽을 경로가 없다(users_select_scope =
            본인 + 같은 기관 관리자) → 이름을 지어내지 않고 빈 값으로 둔다. */}
        담당 요양보호사 : —
      </p>
    </>
  );
}

/** 카드 안 섹션 제목(Bold 25/70). `gap` = 앞 블록 끝에서 이 상자 top 까지. */
export function SectionTitle({
  children, gap, fx, className, style,
}: { children: ReactNode; gap?: number; fx?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <h2
      data-fx={fx}
      className={`whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900 ${className ?? ''}`}
      style={{ marginTop: gap, ...style }}
    >
      {children}
    </h2>
  );
}

/** 섹션 본문(20/28.021). 제목 바로 아래면 `under` 로 상자 겹침을 되뺀다. */
export function SectionBody({
  children, fx, width, under, pre, style, className,
}: {
  children: ReactNode; fx?: string; width?: number; under?: boolean;
  /** 사람이 쓴 글·AI 요약은 줄바꿈이 뜻을 갖는다 → 그대로 보존한다. */
  pre?: boolean;
  style?: React.CSSProperties; className?: string;
}) {
  return (
    <p
      data-fx={fx}
      className={`text-w-body text-ink-700 ${className ?? ''}`}
      style={{
        lineHeight: `${LINE}px`,
        width,
        marginTop: under ? BODY_DY - 70 : undefined,
        whiteSpace: pre ? 'pre-wrap' : undefined,
        wordBreak: 'keep-all',
        ...style,
      }}
    >
      {children}
    </p>
  );
}

/**
 * `어린 시절 / 가족 / 살던 집` 처럼 낱말은 SemiBold, 구분자 ` / ` 는 Regular 로 쓰는 값 줄.
 * (Figma 55:1335·55:1362 실측 — 시안에는 구분자 앞에 공백이 하나 더 붙은 곳이 있는데
 *  오타라 넘기고 ` / ` 로 통일한다.)
 */
export function TokenList({ items, fx, className, style }: {
  items: string[]; fx?: string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <p
      data-fx={fx}
      className={`text-w-body text-ink-700 ${className ?? ''}`}
      style={{ lineHeight: `${LINE}px`, wordBreak: 'keep-all', ...style }}
    >
      {items.length === 0 ? '—' : items.map((v, i) => (
        <span key={`${v}-${i}`}>
          {i > 0 ? ' / ' : null}
          <span className="font-semibold">{v}</span>
        </span>
      ))}
    </p>
  );
}
