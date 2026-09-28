// 세션 목록 (Figma 178:877 — 1440×1035)
//   제목 @169 · 부제 @236.23 · 돌아가기 @(1285,186.18) · 날짜 선택 170×37 @(1203,256.25)
//   카드 1054×632 @(322,315) shadow-card · 행 881×140 @409 (첫 행 381 · 피치 180) shadow-card
//   행 내부: 제목 Bold 25/70 @(472,+19) · 날짜 @(472,+78.44) · 시계 22 @(594,+81.45) ·
//           소요 @(623,+78.44) · 상대일 @(688,+78.44) · 상태 배지 82×25 @(733,+80) ·
//           "대화 기록 보기" SemiBold 20 오른끝 1200 @+58.42 · chevron @(1214.81,+59.28)
//
// ⚠️ Figma 3번째 행만 x 를 1 적게 그렸다(408/471/622/1063) → 409/472/623/1064 로 통일.
// ⚠️ chevron 은 회전 노드라 metadata 좌표(1226.99)가 렌더 위치가 아니다 — 실제는 1214.81.
// ⚠️ 카드 높이는 시안이 3행 고정이지만 실데이터는 개수가 달라진다 → 행 수에서 계산한다.
import { useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { useProfile, useSessions } from '@giokon/data';
import { asset } from '../../assets/ui';
import { DateFilter } from '../../components/ui/DateFilter';
import { SessionRow } from '../../components/session-row';
import { ROW_H, ROW_PITCH } from '../../lib/session-row';
import { Y } from '../../lib/figmaY';
import { dayKey } from '../../lib/format';
import { useElderProfile } from '../../lib/elderProfile';

const CARD_TOP = 315;
const ROW_TOP = 381;
/** 마지막 행 아래 카드 여백(시안: 3행 끝 881 → 카드 끝 947). */
const CARD_PAD_BOTTOM = 66;

/** 로컬 달력 하루 키(`2026-07-08`) — 날짜 필터 비교용. */
export function SessionListPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const profileQuery = useProfile(elderId);
  const sessions = useSessions(elderId);
  const [day, setDay] = useState('');

  const elder = useElderProfile(profileQuery.data);
  const rows = useMemo(() => {
    const all = sessions.data ?? [];
    return day
      ? all.filter((s) => dayKey(s.planned_date ?? s.started_at) === day)
      : all;
  }, [sessions.data, day]);

  const slots = Math.max(rows.length, 1);
  const cardBottom = ROW_TOP + slots * ROW_PITCH - (ROW_PITCH - ROW_H) + CARD_PAD_BOTTOM;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: cardBottom + 88 - 122 }}>
      <h1
        data-fx="178:878"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        {elder ? `${elder.name} 어르신의 세션 목록` : '세션 목록'}
      </h1>
      <p
        data-fx="178:879"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.23) }}
      >
        AI가 어르신과 나눈 회상 대화 세션 목록입니다.
      </p>
      {/* 돌아가기는 **이 화면의 부모 섹션**으로 간다. 예전엔 어르신 상세로 보내
          세션 기록에서 들어온 사람이 엉뚱한 곳으로 튕겼다(2026-09-11 사용자 신고). */}
      <Link
        to="/caregiver/sessions"
        data-fx="178:1171"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(186.18) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        돌아가기
      </Link>

      <DateFilter value={day} onChange={setDay} label="세션 날짜로 거르기" fxBox="178:1031" fxLabel="178:1032" style={{ top: Y(256.25) }} />

      <div
        data-fx="178:745"
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
            to={`/caregiver/sessions/${elderId ?? ''}/${s.id}`}
            actionLabel="대화 기록 보기"
            fx={
              i === 0
                ? {
                    row: '178:746', title: '178:747', date: '178:748', clock: '178:756',
                    duration: '178:749', relative: '194:233', badge: '194:230',
                    link: '178:752', chevron: '178:753',
                  }
                : undefined
            }
          />
        ))
      )}

      {/* 회상 세션 설계 모달 — 이 목록 위에 뜬다 */}
      <Outlet />
    </div>
  );
}
