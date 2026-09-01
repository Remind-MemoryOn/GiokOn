// 공개 이력 상세(보호자 확인 정보) 모달 (Figma 153:1811 `Frame 14` — 1082×758)
//   제목 Bold 25/70 @(84,47) · 배지 @(87,145) · 날짜 @(배지오른쪽+19,149) ·
//   항목 제목 Bold 25/70 @(87,177) · 담당 요양보호사 @(87,241) ·
//   글 자세히 보기 179×48 @(818,188) · 라벨 @(851,200)
//   공개 정보 카드 447×392 @(84,294) — 라벨 @137 · 값 @230 · 행 y 379/453/505/558/610
//   보호자 확인 정보 카드 442×392 @(557,294) — 라벨 @609 · 값 @818 · 행 y 379/419/462
//
// ⚠️ 확인여부·확인 일시·확인 횟수는 `guardian_shares.viewed_at`/`view_count` 가 근거다.
//    보호자가 열어야 생기는 값이라 없으면 `미확인`·`-` 로 둔다(만들지 않는다).
import type { ReactNode } from 'react';
import { dateDotTime } from '@giokon/core';
import type { GuardianShareRow } from '@giokon/data';
import { Badge } from './ui/Badge';
import { Dialog } from './ui/Dialog';

/** 라벨(왼쪽) + 값(오른쪽) 한 줄. 라벨 Regular 18/28 #404040 · 값 Medium 20/28 검정. */
function Row({
  labelLeft, valueLeft, top, label, children, fxLabel, fxValue,
}: {
  labelLeft: number; valueLeft: number; top: number; label: string;
  children: ReactNode; fxLabel?: string; fxValue?: string;
}) {
  return (
    <>
      <span
        data-fx={fxLabel}
        className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-700"
        style={{ left: labelLeft, top }}
      >
        {label}
      </span>
      <span
        data-fx={fxValue}
        className="absolute text-w-body font-medium leading-[28px] text-ink-900"
        style={{ left: valueLeft, top, wordBreak: 'keep-all' }}
      >
        {children}
      </span>
    </>
  );
}

export interface ShareReceipt {
  share: GuardianShareRow;
  badge: { label: string; w: number };
  title: string;
  /** `김복순(88세,여) 햇살 요양원` — 근거가 없는 조각은 빼고 잇는다. */
  elderLine: string;
  guardianName: string | null;
  /** `일지 요약 내용, 관련 사진 (3장)` — 같은 원본으로 공개된 것들. */
  itemsLine: string;
  detailTo: string;
}

export function ShareReceiptDialog({
  open, onClose, receipt,
}: {
  open: boolean;
  onClose: () => void;
  receipt: ShareReceipt | null;
}) {
  if (!receipt) return null;
  const { share } = receipt;
  const live = !share.revoked_at;
  const viewed = share.viewed_at != null;

  return (
    <Dialog open={open} onClose={onClose} size="lg" label="공개 이력 상세">
      <div
        data-fx="153:1623"
        className="relative mx-auto rounded-[10px] bg-white"
        style={{ width: 1082, height: 758 }}
      >
        <h2
          data-fx="153:1629"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 84, top: 47 }}
        >
          공개 이력 상세
        </h2>

        <Badge
          data-fx="153:1672"
          tone="journal"
          tag
          className="absolute"
          style={{ left: 87, top: 145, width: receipt.badge.w }}
        >
          <span data-fx="153:1673">{receipt.badge.label}</span>
        </Badge>
        <span
          data-fx="153:1674"
          className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-500"
          style={{ left: 87 + receipt.badge.w + 19, top: 149 }}
        >
          {dateDotTime(share.shared_at)}
        </span>
        <p
          data-fx="153:1671"
          className="absolute w-[640px] truncate text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 87, top: 177 }}
        >
          {receipt.title}
        </p>
        <p
          data-fx="153:1675"
          className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-700"
          style={{ left: 87, top: 241 }}
        >
          {/* 공개한 사람은 shared_by 지만 이름은 같은 기관 관리자만 읽을 수 있다 */}
          담당 요양보호사 : —
        </p>
        <a
          data-fx="153:1683"
          href={receipt.detailTo}
          className="absolute rounded-[10px] border border-line bg-[#fafafa]"
          style={{ left: 818, top: 188, width: 179, height: 48 }}
        >
          <span
            data-fx="153:1678"
            className="absolute whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-700"
            style={{ left: 33, top: 12 }}
          >
            글 자세히 보기
          </span>
        </a>

        {/* ── 공개 정보 ─────────────────────────────────────────────── */}
        <div
          data-fx="153:1630"
          className="absolute rounded-[10px] border border-line bg-white"
          style={{ left: 84, top: 294, width: 447, height: 392 }}
        />
        <h3
          data-fx="153:1631"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 136, top: 309 }}
        >
          공개 정보
        </h3>
        <Row labelLeft={137} valueLeft={230} top={379} label="어르신" fxLabel="153:1713" fxValue="153:1632">
          <span className="block w-[240px]">{receipt.elderLine}</span>
        </Row>
        <Row labelLeft={137} valueLeft={230} top={453} label="공개일시" fxLabel="153:1723" fxValue="153:1722">
          {dateDotTime(share.shared_at)}
        </Row>
        <Row labelLeft={137} valueLeft={230} top={505} label="공개 대상" fxLabel="153:1726" fxValue="153:1725">
          {receipt.guardianName ? `${receipt.guardianName} 보호자님` : '—'}
        </Row>
        <Row labelLeft={137} valueLeft={230} top={558} label="공개 항목" fxLabel="153:1729" fxValue="153:1728">
          {receipt.itemsLine || '—'}
        </Row>
        <span
          data-fx="153:1732"
          className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-700"
          style={{ left: 137, top: 610 }}
        >
          상태
        </span>
        <Badge
          data-fx="153:1735"
          tone={live ? 'live' : 'mute'}
          fixed
          className="absolute"
          style={{ left: 230, top: 613 }}
        >
          {live ? '공개중' : '공개 취소'}
        </Badge>

        {/* ── 보호자 확인 정보 ──────────────────────────────────────── */}
        <div
          data-fx="153:1639"
          className="absolute rounded-[10px] border border-line bg-white"
          style={{ left: 557, top: 294, width: 442, height: 392 }}
        />
        <h3
          data-fx="153:1640"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 609, top: 309 }}
        >
          보호자 확인 정보
        </h3>
        <span
          data-fx="153:1697"
          className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-700"
          style={{ left: 609, top: 379 }}
        >
          확인여부
        </span>
        <Badge
          data-fx="153:1703"
          tone={viewed ? 'live' : 'mute'}
          fixed
          className="absolute"
          style={{ left: 780, top: 382 }}
        >
          {viewed ? '확인' : '미확인'}
        </Badge>
        <Row labelLeft={609} valueLeft={818} top={419} label="확인 일시" fxLabel="153:1698" fxValue="153:1699">
          {share.viewed_at ? dateDotTime(share.viewed_at) : '-'}
        </Row>
        <Row labelLeft={609} valueLeft={818} top={462} label="확인 횟수" fxLabel="153:1700" fxValue="153:1701">
          {share.view_count > 0 ? `${share.view_count}회` : '-'}
        </Row>
      </div>
    </Dialog>
  );
}
