// 분석 — 대화 분석 목록 (Figma 228:4628 — 1440×1057)
//   제목 @(322,186) · 부제 @(322,236.22) · 돌아가기 @(1285,187.18) ·
//   탭 @301(활성=대화 분석, 밑줄 81×3 @340) · 날짜 선택 170×37 @(1205,287.27)
//   카드 1054×632 @(322,343) · 행 881×140 @409 (첫 행 409 · 피치 180)
//
// 행은 세션 목록(178:877)과 **완전히 같은 부품**이다(내부 좌표까지 동일) →
// `components/session-row.tsx` 를 공유하고, 링크만 대화 분석 상세로 바꾼다.
// ⚠️ Figma 3번째 행만 x 를 1 적게 그렸다(408/471/622/1063) → 409/472/623/1064 로 통일.
// ⚠️ 분석이 아직 없는 세션도 목록에는 나온다 — 눌러 들어가면 "분석 없음" 을 보여 준다
//    (목록에서 감추면 요양보호사가 세션이 사라진 줄 안다).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toElderProfile, useProfile, useSessions } from '@giokon/data';
import { asset } from '../../assets/ui';
import { SessionRow } from '../../components/session-row';
import { ROW_H, ROW_PITCH } from '../../lib/session-row';

const Y = (v: number) => v - 122;

const CARD_TOP = 343;
const ROW_TOP = 409;
/** 마지막 행 아래 카드 여백(시안: 3행 끝 909 → 카드 끝 975). */
const CARD_PAD_BOTTOM = 66;

/** 로컬 달력 하루 키(`2026-07-08`) — 날짜 필터 비교용. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ConversationAnalysisListPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const profileQuery = useProfile(elderId);
  const sessions = useSessions(elderId);
  const [day, setDay] = useState('');

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  const rows = useMemo(() => {
    // 분석은 대화가 **끝나야** 생긴다 — 설계·진행 중 세션을 여기 세우면 빈 분석으로 간다.
    const all = (sessions.data ?? []).filter((s) => s.status === 'ended');
    return day
      ? all.filter((s) => dayKey(s.planned_date ?? s.started_at) === day)
      : all;
  }, [sessions.data, day]);

  const slots = Math.max(rows.length, 1);
  const cardBottom = ROW_TOP + slots * ROW_PITCH - (ROW_PITCH - ROW_H) + CARD_PAD_BOTTOM;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: cardBottom + 82 - 122 }}>
      <h1
        data-fx="228:4671"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(186) }}
      >
        {elder ? `${elder.name} 어르신의 대화 분석` : '대화 분석'}
      </h1>
      <p
        data-fx="228:4672"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.22) }}
      >
        AI 회상 대화 세션을 선택하여 대화 분석 결과를 확인해보세요.
      </p>
      <Link
        to="/caregiver/analysis/elders"
        data-fx="228:4748"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(187.18) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        돌아가기
      </Link>

      {/* 탭 — 종합 분석 / 대화 분석(활성) */}
      <Link
        to={`/caregiver/analysis/${elderId ?? ''}`}
        data-fx="228:4688"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 426, top: Y(301) }}
      >
        종합 분석
      </Link>
      <span
        data-fx="228:4680"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 598, top: Y(301) }}
      >
        대화 분석
      </span>
      <div
        data-fx="228:4681"
        className="absolute h-[3px] w-[81px] bg-accent"
        style={{ left: 598, top: Y(340) }}
      />

      {/* 날짜 선택 — 여는 화면이 디자인에 없어 네이티브 날짜 선택기를 투명하게 덮는다 */}
      <div
        data-fx="231:4895"
        className="absolute left-[1205px] h-[37.04px] w-[170px] rounded-[5px] border border-line bg-white focus-within:border-accent"
        style={{ top: Y(287.27) }}
      >
        <img
          src={asset.iconCalendarSm}
          alt=""
          width={22}
          height={22}
          className="pointer-events-none absolute left-[13px] top-[8.01px] block"
        />
        <span
          data-fx="231:4896"
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
          className="pointer-events-none absolute left-[156px] top-1/2 block -translate-y-1/2"
        />
        <input
          type="date"
          aria-label="세션 날짜로 거르기"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div
        data-fx="231:4836"
        className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardBottom - CARD_TOP }}
      />

      {rows.length === 0 ? (
        <div
          className="absolute left-[409px] flex w-[881px] flex-col items-center gap-[12px]"
          style={{ top: Y(ROW_TOP + 48) }}
        >
          <p className="text-w-body leading-[30px] text-ink-500">
            {day ? '선택한 날짜에 진행된 세션이 없습니다.' : '아직 진행된 세션이 없습니다.'}
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
        rows.map((s, i) => (
          <SessionRow
            key={s.id}
            session={s}
            top={Y(ROW_TOP + i * ROW_PITCH)}
            to={`/caregiver/analysis/${elderId ?? ''}/sessions/${s.id}`}
            actionLabel="대화 분석 보기"
            fx={
              i === 0
                ? {
                    row: '231:4837', title: '231:4838', date: '231:4839', clock: '231:4846',
                    duration: '231:4840', relative: '231:4881', badge: '231:4882',
                    link: '231:4842', chevron: '231:4843',
                  }
                : undefined
            }
          />
        ))
      )}
    </div>
  );
}
