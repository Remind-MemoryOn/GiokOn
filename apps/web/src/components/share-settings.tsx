// 공개 기록 설정 모달 (Figma 146:422 `Frame 11` 1103×729 · 요양일지 변형 `Frame 12` 1103×841)
//   제목 Bold 25/70 @(95,49) · 배지 35 @(86,132) · 날짜 @(배지오른쪽+19,136) ·
//   항목 제목 Bold 25/70 @(95,165) · 취소 140×57 @(698,157) · 공개하기 140×57 @(869,157)
//   공개 대상 카드 447×174 @(95,241) · 공개 후 보호자 확인 카드 447×174 @(562,241)
//   공개 항목 카드 917×209 @(93,437) — 체크 27×28 @146, 라벨 @192, 행 피치 43
//   요양일지 변형은 카드가 320 이고 사진 스트립 109 @(192,610) 이 붙는다(모달 841).
//
// ⚠️ 항목 단위 공개다 — 한 항목에서 고른 것만 `guardian_shares` 로 만든다.
//    요양일지 = 일지 요약(journal) + 관련 사진(photo N건) · AI 요약 = 대화 요약(session_summary)
//    + 대화 AI 분석(analysis). 고르지 않은 것은 공개하지 않는다.
// ⚠️ `Frame 12` 는 노드 id 를 모른다(export 만 있다) → 정밀 대조는 `Frame 11` 만 건다.
import { useState } from 'react';
import type { JournalPhotoRow, ShareItemType } from '@giokon/data';
import { dateDotTime } from '@giokon/core';
import { asset } from '../assets/ui';
import { Badge } from './ui/Badge';
import { Dialog } from './ui/Dialog';

/** 체크 한 줄 — 체크박스 27×28 + 라벨 20/24. */
function CheckRow({
  left, top, label, checked, onToggle, fxBox, fxLabel,
}: {
  left: number; top: number; label: string; checked: boolean; onToggle: () => void;
  fxBox?: string; fxLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="absolute flex items-start"
      style={{ left, top }}
    >
      {/* 체크박스 틀은 Figma 에셋 그대로(27×28) — 선택 표시는 안쪽 accent 사각형 */}
      <span data-fx={fxBox} className="relative block" style={{ width: 27, height: 28 }}>
        <img src={asset.iconCheckbox} alt="" width={27} height={28} className="block" />
        {checked ? <span className="absolute inset-[6px] rounded-[2px] bg-accent" /> : null}
      </span>
      <span
        data-fx={fxLabel}
        className="absolute whitespace-nowrap text-w-body leading-[24px] text-ink-900"
        style={{ left: 46, top: 2 }}
      >
        {label}
      </span>
    </button>
  );
}

export interface ShareTarget {
  type: 'journal' | 'analysis';
  id: string;
  badge: { label: string; w: number };
  at: string;
  title: string;
}

export interface SharePick {
  /** 후보 전부 — 체크된 것은 공개하고, 체크가 풀린 것은 이미 공개돼 있으면 철회한다. */
  items: { type: ShareItemType; id: string; checked: boolean }[];
  notifyOnView: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  item: ShareTarget | null;
  guardianName: string | null;
  photos: JournalPhotoRow[];
  photoUrls?: Record<string, string>;
  pending?: boolean;
  /** 이미 공개된 상태 — 모달을 열 때 그대로 체크해 둔다(없는 상태를 만들지 않는다). */
  initial?: { summary: boolean; second: boolean; notify: boolean };
  onPublish: (pick: SharePick) => void;
}

export function ShareSettingsDialog(props: Props) {
  // 선택 상태는 항목마다 새로 시작한다 — effect 로 되심지 않고 key 로 다시 마운트한다.
  if (!props.item) return null;
  return <SettingsForm key={props.item.id} {...props} item={props.item} />;
}

function SettingsForm({
  open, onClose, item, guardianName, photos, photoUrls, pending, initial, onPublish,
}: Props & { item: ShareTarget }) {
  const [toGuardian, setToGuardian] = useState(true);
  const [notify, setNotify] = useState(initial?.notify ?? false);
  const [picked, setPicked] = useState<Record<string, boolean>>({
    summary: initial?.summary ?? true,
    second: initial?.second ?? true,
  });

  const isJournal = item.type === 'journal';
  const rows = isJournal
    ? [
        { key: 'summary', label: '일지 요약 내용' },
        { key: 'second', label: `관련 사진 (${photos.length}장)` },
      ]
    : [
        { key: 'summary', label: '대화 요약 내용' },
        { key: 'second', label: '대화 AI 분석' },
      ];
  const strip = isJournal && photos.length > 0;
  const cardCHeight = strip ? 320 : 209;
  const panelHeight = strip ? 841 : 729;

  function submit() {
    const out: { type: ShareItemType; id: string; checked: boolean }[] = [
      {
        type: isJournal ? 'journal' : 'session_summary',
        id: item.id,
        checked: Boolean(picked.summary),
      },
    ];
    if (isJournal) {
      for (const p of photos) out.push({ type: 'photo', id: p.id, checked: Boolean(picked.second) });
    } else {
      out.push({ type: 'analysis', id: item.id, checked: Boolean(picked.second) });
    }
    onPublish({ items: out, notifyOnView: notify });
  }

  const canPublish = toGuardian && Boolean(guardianName) && (picked.summary || picked.second);

  return (
    <Dialog open={open} onClose={onClose} size="lg" label="공개 기록 설정">
      <div
        data-fx="146:422"
        className="relative mx-auto rounded-[10px] bg-white"
        style={{ width: 1103, height: panelHeight }}
      >
        <h2
          data-fx="146:318"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 95, top: 49 }}
        >
          공개 기록 설정
        </h2>

        <Badge
          data-fx="146:314"
          tone="accent"
          tag
          className="absolute"
          style={{ left: 86, top: 132, width: item.badge.w }}
        >
          <span data-fx="146:315">{item.badge.label}</span>
        </Badge>
        <span
          data-fx="146:316"
          className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-500"
          style={{ left: 86 + item.badge.w + 19, top: 136 }}
        >
          {dateDotTime(item.at)}
        </span>
        <p
          data-fx="146:325"
          className="absolute w-[560px] truncate text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 95, top: 165 }}
        >
          {item.title}
        </p>

        <button
          type="button"
          data-fx="146:320"
          onClick={onClose}
          className="absolute h-[57px] w-[140px] rounded-[10px] border border-accent bg-white"
          style={{ left: 698, top: 157 }}
        >
          <span
            data-fx="146:321"
            className="absolute whitespace-nowrap text-[18px] font-semibold leading-[30px] text-accent"
            style={{ left: 54, top: 14 }}
          >
            취소
          </span>
        </button>
        <button
          type="button"
          data-fx="146:323"
          disabled={!canPublish || pending}
          onClick={submit}
          className="absolute h-[57px] w-[140px] rounded-[10px] bg-accent disabled:opacity-60"
          style={{ left: 869, top: 157 }}
        >
          <span
            data-fx="146:324"
            className="absolute whitespace-nowrap text-[18px] font-semibold leading-[30px] text-white"
            style={{ left: 39, top: 14 }}
          >
            공개하기
          </span>
        </button>

        {/* ── 공개 대상 ─────────────────────────────────────────────── */}
        <div
          data-fx="146:326"
          className="absolute rounded-[10px] border border-line bg-white"
          style={{ left: 95, top: 241, width: 447, height: 174 }}
        />
        <h3
          data-fx="146:328"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 147, top: 256 }}
        >
          공개 대상
        </h3>
        <CheckRow
          left={147}
          top={348}
          fxBox="146:331"
          fxLabel="146:333"
          checked={toGuardian}
          onToggle={() => setToGuardian((v) => !v)}
          // 연결된 보호자가 없으면 공개할 상대가 없다 — 없는 이름을 만들지 않는다.
          label={guardianName ? `보호자 (${guardianName} 보호자님)` : '연결된 보호자가 없어요'}
        />

        {/* ── 공개 후 보호자 확인 ───────────────────────────────────── */}
        <div
          data-fx="146:327"
          className="absolute rounded-[10px] border border-line bg-white"
          style={{ left: 562, top: 241, width: 447, height: 174 }}
        />
        <h3
          data-fx="146:329"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 612, top: 256 }}
        >
          공개 후 보호자 확인
        </h3>
        <p
          data-fx="146:330"
          className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-500"
          style={{ left: 612, top: 311 }}
        >
          보호자가 해당 기록을 확인하면 알림을 받습니다.
        </p>
        <CheckRow
          left={612}
          top={348}
          fxBox="146:332"
          fxLabel="146:334"
          label="보호자 확인 알림 받기"
          checked={notify}
          onToggle={() => setNotify((v) => !v)}
        />

        {/* ── 공개 항목 ─────────────────────────────────────────────── */}
        <div
          data-fx="146:335"
          className="absolute rounded-[10px] border border-line bg-white"
          style={{ left: 93, top: 437, width: 917, height: cardCHeight }}
        />
        <h3
          data-fx="146:336"
          className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          style={{ left: 145, top: 452 }}
        >
          공개 항목
        </h3>
        {rows.map((r, i) => (
          <CheckRow
            key={r.key}
            left={146}
            top={524 + i * 43}
            fxBox={i === 0 ? '146:337' : '146:339'}
            fxLabel={i === 0 ? '146:338' : '146:340'}
            label={r.label}
            checked={Boolean(picked[r.key])}
            onToggle={() => setPicked((p) => ({ ...p, [r.key]: !p[r.key] }))}
          />
        ))}
        {strip ? (
          <div className="absolute flex gap-[10px]" style={{ left: 192, top: 610 }}>
            {photos.slice(0, 6).map((p) => (
              <img
                key={p.id}
                src={photoUrls?.[p.path]}
                alt={p.caption ?? ''}
                className="block rounded-[5px] border border-line bg-cream-100 object-cover"
                style={{ width: 109, height: 109 }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
