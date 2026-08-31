// 요양일지 목록 (Figma 207:1147 — 1440×1579)
//   목록으로 @(322,194.12) · 제목 @(322,243) · 부제 2줄 w519 @(322,293.19) ·
//   "새 요양일지 작성" 185×57 r10 accent @(1194,188) · 날짜 선택 170×37 @(1209,316.2)
//   카드 1057×1116 @(322,376) · 행 879×235.15 @410 (첫 행 427.27 · 피치 259.164)
//   행 내부: 배지 107×35 @+41.73 · 배지 글자 SemiBold 20 @+48.03 · 날짜 @(175,+46.03) ·
//           제목 Bold 25/70 @(68,+73.73) · 본문 Regular 20/28 @(68,+138.09) ·
//           연필 28 @(710,+103.73) · 휴지통 27 @(769,+104.07)
//
// ⚠️ Figma 는 행 사각형을 소수 y(427.27·686.43…)에, 안쪽 요소는 정수 그리드(469·728…)에
//    올려놔 행마다 0.2~0.5px 씩 어긋난다 → 행 기준 상대좌표로 통일한다.
// ⚠️ 일지 사진은 아직 1장 컬럼(`care_journals.photo_path`)이다 — 시안의 "관련 사진 (3장)"
//    은 여러 장을 전제하므로 Phase 2 에서 `journal_photos` 를 만든 뒤 붙인다.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toElderProfile, useCareJournals, useDeleteCareJournal, useProfile } from '@giokon/data';
import { dateDot } from '@giokon/core';
import { asset } from '../../assets/ui';
import { Badge } from '../../components/ui/Badge';
import { useStore } from '../../store/store';

const Y = (v: number) => v - 122;

const CARD_TOP = 376;
const ROW_TOP = 427.27;
const ROW_H = 235.15;
const ROW_PITCH = 259.164;
/** 마지막 행 아래 카드 여백(시안: 4행 끝 1439.91 → 카드 끝 1492). */
const CARD_PAD_BOTTOM = 52.09;

/** 로컬 달력 하루 키(`2026-07-08`) — 날짜 필터 비교용. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `7월 30일 요양일지` — 값이 없으면 만들지 않는다. */
function rowTitle(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '요양일지';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 요양일지`;
}

export function JournalListPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const profileQuery = useProfile(elderId);
  const journals = useCareJournals(elderId);
  const remove = useDeleteCareJournal();
  const toast = useStore((s) => s.toast);
  const [day, setDay] = useState('');

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  const rows = useMemo(() => {
    const all = journals.data ?? [];
    return day ? all.filter((j) => dayKey(j.journal_date) === day) : all;
  }, [journals.data, day]);

  const slots = Math.max(rows.length, 1);
  const cardBottom = ROW_TOP + slots * ROW_PITCH - (ROW_PITCH - ROW_H) + CARD_PAD_BOTTOM;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: cardBottom + 87 - 122 }}>
      <Link
        to="/caregiver/journal"
        data-fx="210:1531"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 322, top: Y(194.12) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        목록으로
      </Link>
      <h1
        data-fx="210:1528"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(243) }}
      >
        {elder ? `${elder.name} 어르신의 요양일지 목록` : '요양일지 목록'}
      </h1>
      <p
        data-fx="210:1529"
        className="absolute left-[322px] w-[519px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(293.19), wordBreak: 'keep-all' }}
      >
        어르신의 요양일지를 기록하고 보호자에게 공유하세요. 연필 모양을 클릭하시면 상세기록을
        확인하고 수정할 수 있습니다.
      </p>

      <Link
        to={`/caregiver/journal/${elderId ?? ''}/new`}
        data-fx="210:1525"
        className="absolute flex h-[57px] w-[185px] items-center justify-center gap-[8px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white"
        style={{ left: 1194, top: Y(188) }}
      >
        <span className="text-w-section leading-[30px]">+</span>새 요양일지 작성
      </Link>

      {/* 날짜 선택 — 여는 화면이 디자인에 없어 네이티브 날짜 선택기를 투명하게 덮는다 */}
      <div
        data-fx="210:1421"
        className="absolute left-[1209px] h-[37.02px] w-[170px] rounded-[5px] border border-line bg-white focus-within:border-accent"
        style={{ top: Y(316.2) }}
      >
        <img
          src={asset.iconCalendarSm}
          alt=""
          width={22}
          height={22}
          className="pointer-events-none absolute left-[13px] top-[8.01px] block"
        />
        <span
          data-fx="210:1422"
          className="pointer-events-none absolute left-[47px] whitespace-nowrap text-[16px] leading-[30px] text-ink-500"
          style={{ top: 4.0 }}
        >
          {day ? day.replace(/-/g, '.') : '날짜 선택하기'}
        </span>
        <img
          src={asset.iconChevronDownSm}
          alt=""
          width={12}
          height={7.81}
          className="pointer-events-none absolute left-[156px] top-[23.61px] block"
        />
        <input
          type="date"
          aria-label="일지 날짜로 거르기"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div
        data-fx="210:1656"
        className="absolute left-[322px] w-[1057px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardBottom - CARD_TOP }}
      />

      {rows.length === 0 ? (
        <div
          className="absolute left-[410px] flex w-[879px] flex-col items-center gap-[12px]"
          style={{ top: Y(ROW_TOP + 80) }}
        >
          <p className="text-w-body leading-[30px] text-ink-500">
            {day ? '선택한 날짜에 쓴 요양일지가 없습니다.' : '아직 쓴 요양일지가 없습니다.'}
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
        rows.map((j, i) => {
          const top = ROW_TOP + i * ROW_PITCH;
          return (
            <div key={j.id}>
              <div
                data-fx={i === 0 ? '210:1649' : undefined}
                className="absolute left-[410px] w-[879px] rounded-[10px] border border-line bg-white"
                style={{ top: Y(top), height: ROW_H }}
              />
              <Badge
                data-fx={i === 0 ? '210:1651' : undefined}
                tone="journal"
                tag
                className="absolute left-[459px]"
                style={{ top: Y(top + 41.73) }}
              >
                요양일지
              </Badge>
              <span
                data-fx={i === 0 ? '210:1653' : undefined}
                className="absolute left-[585px] whitespace-nowrap text-w-body leading-[28px] text-ink-500"
                style={{ top: Y(top + 46.03) }}
              >
                {dateDot(j.journal_date)}
              </span>
              <p
                data-fx={i === 0 ? '210:1650' : undefined}
                className="absolute left-[478px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
                style={{ top: Y(top + 73.73) }}
              >
                {rowTitle(j.journal_date)}
              </p>
              <p
                data-fx={i === 0 ? '210:1654' : undefined}
                className="absolute left-[478px] w-[680px] text-w-body leading-[28px] text-ink-700"
                style={{ top: Y(top + 138.09), wordBreak: 'keep-all' }}
              >
                {j.content}
              </p>
              <Link
                to={`/caregiver/journal/${elderId ?? ''}/${j.id}`}
                aria-label={`${rowTitle(j.journal_date)} 수정`}
                className="absolute block"
                style={{ left: 1120, top: Y(top + 103.73), width: 28, height: 28 }}
              >
                <img src={asset.iconPencilLg} alt="" className="block h-full w-full" />
              </Link>
              {/* 삭제 확인 화면이 디자인에 없어 브라우저 확인으로 되돌릴 수 없는 동작을 막는다 */}
              <button
                type="button"
                aria-label={`${rowTitle(j.journal_date)} 삭제`}
                onClick={() => {
                  if (!elderId) return;
                  if (!window.confirm(`${rowTitle(j.journal_date)}를 삭제할까요? 되돌릴 수 없어요.`)) return;
                  remove.mutate(
                    { id: j.id, profileId: elderId },
                    {
                      onSuccess: () => toast('success', '요양일지를 삭제했어요.'),
                      onError: (e) => toast('error', e.message),
                    },
                  );
                }}
                className="absolute block"
                style={{ left: 1179, top: Y(top + 104.07), width: 26.97, height: 27.02 }}
              >
                <img src={asset.iconTrashLg} alt="" className="block h-full w-full" />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
