// 세션 행 881×140 — 세션 목록(178:877)과 대화 분석 목록(228:4628)이 **같은 부품**을 쓴다.
// 두 시안의 행 내부 좌표가 완전히 같아(제목 +19 · 날짜 +78.44 · 시계 +81.45 · 소요 +78.44 ·
// 상대일 +78.44 · 배지 +80 · 링크 +58.42 · chevron +59.28) 한 곳에서 관리한다.
//
// ⚠️ chevron 은 상하좌우 반전 노드라 metadata 좌표(1226.99, 행+78.01)가 렌더 위치가 아니다
//    — 실제는 (1214.81, 행+59.28)이다.
import { Link } from 'react-router-dom';
import { dateDot, relativeDay } from '@giokon/core';
import type { SessionRow as SessionRowData } from '@giokon/data';
import { asset } from '../assets/ui';
import { Badge } from './ui/Badge';
import { ROW_H, durationLabel } from '../lib/session-row';

interface Props {
  session: SessionRowData;
  /** 행 위 끝(화면 절대 y — 부모가 Y() 로 감싼다). */
  top: number;
  to: string;
  actionLabel: string;
  /** 보호자 화면(104:1041)은 상대일·상태 배지를 그리지 않는다 — 세션 상태는 공개 항목이 아니다. */
  compact?: boolean;
  /** 첫 행에만 붙이는 실측 감사 앵커. */
  fx?: {
    row?: string; title?: string; date?: string; clock?: string;
    duration?: string; relative?: string; badge?: string; link?: string; chevron?: string;
  };
}

export function SessionRow({ session: s, top, to, actionLabel, compact, fx = {} }: Props) {
  const when = s.planned_date ?? s.started_at;
  const duration = durationLabel(s.duration_minutes, s.duration_seconds);
  const tone = s.status === 'active' ? 'live' : s.status === 'planned' ? 'accent' : 'mute';
  const label = s.status === 'active' ? '진행 중' : s.status === 'planned' ? '설계됨' : '종료';

  return (
    <>
      <div
        data-fx={fx.row}
        className="absolute left-[409px] w-[881px] rounded-[10px] bg-white shadow-card"
        style={{ top, height: ROW_H }}
      />
      <p
        data-fx={fx.title}
        className="absolute left-[472px] w-[560px] truncate text-w-section font-bold leading-[70px] text-ink-900"
        style={{ top: top + 19 }}
      >
        {s.title ?? s.current_topic ?? '회상 대화'}
      </p>
      <span
        data-fx={fx.date}
        className="absolute left-[472px] whitespace-nowrap text-w-body leading-[28px] text-ink-500"
        style={{ top: top + 78.44 }}
      >
        {dateDot(when)}
      </span>
      {duration ? (
        <>
          <img
            data-fx={fx.clock}
            src={asset.iconClockSm}
            alt=""
            width={22}
            height={22}
            className="absolute left-[594px] block"
            style={{ top: top + 81.45 }}
          />
          <span
            data-fx={fx.duration}
            className="absolute left-[623px] whitespace-nowrap text-w-body leading-[28px] text-ink-500"
            style={{ top: top + 78.44 }}
          >
            {duration}
          </span>
        </>
      ) : null}
      {/* 상대일 + 상태는 **한 줄로 붙여** 놓는다 — 시안의 "오늘"(35) 기준 좌표에
          고정하면 "23일 전"처럼 긴 값에서 배지가 글자를 덮는다. */}
      {compact ? null : (
        <div
          className="absolute left-[688px] flex h-[28px] items-center gap-[10px] whitespace-nowrap"
          style={{ top: top + 78.44 }}
        >
          <span data-fx={fx.relative} className="text-w-body leading-[28px] text-ink-500">
            {relativeDay(when)}
          </span>
          <Badge data-fx={fx.badge} tone={tone} fixed>
            {label}
          </Badge>
        </div>
      )}
      <Link
        to={to}
        data-fx={fx.link}
        className="absolute w-[136px] whitespace-nowrap text-right text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1064, top: top + 58.42 }}
      >
        {actionLabel}
      </Link>
      <img
        data-fx={fx.chevron}
        src={asset.iconChevronRightSm}
        alt=""
        className="pointer-events-none absolute block"
        style={{ left: 1214.81, top: top + 59.28, width: 12.18, height: 18.73 }}
      />
    </>
  );
}
