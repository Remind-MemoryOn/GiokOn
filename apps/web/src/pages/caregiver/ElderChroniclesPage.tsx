// 연대기 목록 (Figma 198:506 — 1440×1359 실측)
//   제목 @169 · 부제 2줄 @236.17 · 돌아가기 @(1286,191.14) · 날짜 선택 170×37 @(1213,258.19)
//   카드 1057×956 @(324,318) shadow-card · 행 879×168.12 @411 (첫 행 369.27 · 피치 192.14)
//   행 내부: 출처 배지 h35 r100 @(470,+40.73) · 날짜 @+45.03 · 제목 Bold 25/70 @(475,+65.73)
//           연필 28 @(1141,+73.73) · 휴지통 27 @(1200,+74.06)
//   연대기 추가 879×77.06 @(411, 마지막 행 + 33.02) — 테두리 accent
//
// ⚠️ Figma 는 행 4개로 고정된 카드를 그렸다. 실데이터는 개수가 달라지므로 **카드 높이를
//    행 수에서 계산**한다(위/아래 여백·행 간격은 실측 그대로).
// ⚠️ 제목(`title`)은 사람이 붙이는 값이라 AI 가 모은 항목·구 데이터에는 없다 →
//    없으면 `content` 로 대신 보여 준다(제목을 지어내지 않는다).
import { useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { useChronicles, useDeleteChronicle, useProfile } from '@giokon/data';
import { dateDot, isKeyMemory, relativeDay } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;

/** 카드 안쪽 실측 — 행 크기·간격과 위/아래 여백. */
const CARD_TOP = 318;
const ROW_TOP = 369.27;
const ROW_H = 168.12;
const ROW_PITCH = 192.14;
/** 마지막 행 아래 여백 + "연대기 추가" 줄 높이 + 카드 아래 여백. */
const ADD_GAP = 33.02;
const ADD_H = 77.06;
const CARD_PAD_BOTTOM = 50.1;

/** 로컬 달력 하루 키(`2026-07-08`) — 날짜 필터 비교용. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ElderChroniclesPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const toast = useStore((s) => s.toast);
  const profileQuery = useProfile(elderId);
  const chronicles = useChronicles(elderId);
  const remove = useDeleteChronicle();
  const [day, setDay] = useState('');

  const rows = useMemo(() => {
    const all = [...(chronicles.data ?? [])]
      // 주요 기억은 '기본 정보 수정' 폼이 관리한다 → 여기서 또 지울 수 있게 두지 않는다.
      .filter((c) => !isKeyMemory(c.topic))
      .sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
    );
    return day ? all.filter((c) => dayKey(c.recorded_at) === day) : all;
  }, [chronicles.data, day]);

  // 카드 높이는 행 수에서 계산한다. 비어 있어도 안내 문구가 들어갈 한 줄은 남긴다.
  const slots = Math.max(rows.length, 1);
  const addTop = ROW_TOP + slots * ROW_PITCH + (ADD_GAP - (ROW_PITCH - ROW_H));
  const cardBottom = addTop + ADD_H + CARD_PAD_BOTTOM;
  const backTo = `/caregiver/elders/${elderId ?? ''}`;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: cardBottom + 85 - 122 }}>
      <h1
        data-fx="198:565"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        연대기 목록
      </h1>
      <p
        data-fx="198:566"
        className="absolute left-[322px] w-[411px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.17) }}
      >
        어르신의 연대기를 수정하고 관리합니다. <span className="font-semibold">연필 모양</span>을
        <br />
        클릭하시면 상세기록을 확인하고 수정할 수 있습니다.
      </p>
      <Link
        to={backTo}
        data-fx="198:567"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1286, top: Y(191.14) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        돌아가기
      </Link>

      {/* 날짜 선택 — 여는 화면이 디자인에 없어 네이티브 날짜 선택기를 투명하게 덮는다 */}
      <div
        data-fx="207:1412"
        className="absolute left-[1213px] h-[37.03px] w-[170px] rounded-[5px] border border-line bg-white focus-within:border-accent"
        style={{ top: Y(258.19) }}
      >
        <img
          src={asset.iconCalendarSm}
          alt=""
          width={22}
          height={22}
          className="pointer-events-none absolute left-[13px] top-[8.01px] block"
        />
        <span
          data-fx="207:1413"
          className="pointer-events-none absolute left-[47px] whitespace-nowrap text-[16px] leading-[30px] text-ink-500"
          style={{ top: 4.01 }}
        >
          {day ? day.replace(/-/g, '.') : '날짜 선택하기'}
        </span>
        <img
          src={asset.iconChevronDownSm}
          alt=""
          width={12}
          height={7.81}
          className="pointer-events-none absolute left-[144px] top-[15.81px] block"
        />
        <input
          type="date"
          aria-label="기록일로 거르기"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div
        data-fx="198:902"
        className="absolute left-[324px] w-[1057px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardBottom - CARD_TOP }}
      />

      {rows.length === 0 ? (
        <div
          className="absolute left-[411px] flex w-[879px] flex-col items-center gap-[12px]"
          style={{ top: Y(ROW_TOP + 56) }}
        >
          <p className="text-w-body leading-[30px] text-ink-500">
            {day ? '선택한 날짜에 기록된 연대기가 없습니다.' : '아직 연대기 항목이 없습니다.'}
          </p>
          {day ? (
            <button
              type="button"
              onClick={() => setDay('')}
              className="text-w-sub font-semibold leading-[30px] text-accent underline"
            >
              전체 보기
            </button>
          ) : null}
        </div>
      ) : (
        rows.map((c, i) => {
          const ai = c.source === 'ai';
          const label = c.title ?? c.content;
          const rowTop = ROW_TOP + i * ROW_PITCH;
          return (
            <div key={c.id}>
              <div
                data-fx={i === 0 ? '198:904' : undefined}
                className="absolute left-[411px] w-[879px] rounded-[10px] border border-line bg-white"
                style={{ top: Y(rowTop), height: ROW_H }}
              />
              <span
                data-fx={i === 0 ? '198:905' : undefined}
                className={cn(
                  'absolute left-[470px] inline-flex h-[35px] items-center justify-center rounded-pill text-[20px] font-semibold leading-[24px]',
                  ai ? 'bg-accent-tint text-accent' : 'bg-manual-soft text-manual',
                )}
                style={{ top: Y(rowTop + 40.73), width: ai ? 95 : 124 }}
              >
                {ai ? 'AI 자동' : '요양보호사'}
              </span>
              <span
                data-fx={i === 0 ? '198:907' : undefined}
                className="absolute whitespace-pre text-w-body leading-[28px] text-ink-500"
                style={{ left: ai ? 580 : 614, top: Y(rowTop + 45.03) }}
              >
                {`${dateDot(c.recorded_at)}   ${relativeDay(c.recorded_at)}`}
              </span>
              <p
                data-fx={i === 0 ? '198:908' : undefined}
                className="absolute left-[475px] w-[640px] truncate text-w-section font-bold leading-[70px] text-ink-900"
                style={{ top: Y(rowTop + 65.73) }}
              >
                {label}
              </p>
              <Link
                to={`/caregiver/elders/${elderId ?? ''}/chronicles/${c.id}`}
                data-fx={i === 0 ? '198:932' : undefined}
                aria-label={`${label} 상세 기록 열기`}
                className="absolute left-[1141px] block"
                style={{ top: Y(rowTop + 73.73) }}
              >
                <img src={asset.iconPencilLg} alt="" width={28} height={28} className="block" />
              </Link>
              <button
                type="button"
                data-fx={i === 0 ? '198:909' : undefined}
                aria-label={`${label} 삭제`}
                onClick={() => {
                  if (!window.confirm(`"${label}" 연대기를 삭제할까요? 되돌릴 수 없습니다.`)) return;
                  remove.mutate(
                    { id: c.id, profileId: c.profile_id },
                    {
                      onSuccess: () => toast('success', '연대기를 삭제했어요.'),
                      onError: (err) => toast('error', err.message),
                    },
                  );
                }}
                className="absolute left-[1200px] block"
                style={{ top: Y(rowTop + 74.06) }}
              >
                <img src={asset.iconTrashLg} alt="" width={26.97} height={27.02} className="block" />
              </button>
            </div>
          );
        })
      )}

      <Link
        to={`/caregiver/elders/${elderId ?? ''}/chronicles/new`}
        data-fx="198:942"
        className="absolute left-[411px] flex w-[879px] items-center justify-center rounded-[10px] border border-accent bg-white text-accent"
        style={{ top: Y(addTop), height: ADD_H }}
      >
        <span className="text-[30px] font-semibold leading-[30px]" aria-hidden>
          +
        </span>
        <span data-fx="198:944" className="ml-[7px] text-[25px] font-semibold leading-[30px]">
          연대기 추가
        </span>
      </Link>

      {profileQuery.data ? (
        <span className="sr-only">{profileQuery.data.name} 어르신의 연대기 목록</span>
      ) : null}

      {/* 연대기 추가·상세 모달 — 이 목록 위에 뜬다 */}
      <Outlet />
    </div>
  );
}
