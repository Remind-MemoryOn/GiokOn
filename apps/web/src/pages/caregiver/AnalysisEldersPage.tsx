// 분석 — 개인별 (Figma 228:3722 — 1440×1025) : 어르신을 골라 개인별 분석으로 들어간다
//   제목 @(322,186) · 부제 @(322,236.23) · 탭 @301(활성=개인별, 밑줄 101×3 @340)
//   카드 1054×595 r10 @(322,343) — 검색 335×57 @(375,389.38)
//   어르신 카드 301×161 r10 @(375|698|1021, 486) — 사진 76 r63 @+25,+28 ·
//   이름 Bold 25/70 @+115,+16 · 나이 Medium 16/30 @+115,+71.5 · 성별l기관 @+115,+99.6
//
// ⚠️ 활성 탭 밑줄은 **좌우 반전 노드**라 metadata x(699)가 렌더 위치가 아니다 —
//    export 잉크는 598~699 라 왼끝은 598(= 699 − 101)이다.
// ⚠️ Figma 는 1번째 카드의 아래 두 줄만 1px 위로 흘려 놨다 → 2·3번째 값으로 통일한다.
// ⚠️ 성별l기관 줄의 Figma 노드 박스는 h=23 이지만 **잉크는 30 라인박스 기준**이다
//    (손으로 상자만 줄인 흔적) — leading 23 으로 그리면 잉크가 3.5px 떠오른다.
// ⚠️ 카드 높이 595 는 어르신 3명 기준이다 — 실데이터는 인원이 달라지므로 줄 수에서 계산한다.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toElderProfile, useOrganization, useProfiles } from '@giokon/data';
import { elderAge } from '@giokon/core';
import { asset } from '../../assets/ui';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';
import { Y } from '../../lib/figmaY';

const CARD_TOP = 343;
/** 카드 좌상단 기준 어르신 카드 배치 — 3열, 가로 피치 323, 세로 피치 200. */
const ROW_TOP = 486 - CARD_TOP; // 143
const COL_X = [375 - 322, 698 - 322, 1021 - 322]; // 53 / 376 / 699
const ELDER_H = 161;
const ROW_PITCH = 200;
/** 시안(3명·1줄)의 카드 아래 여백 = 938 − 647. */
const CARD_PAD_BOTTOM = 291;

const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성' };

/** Figma 실측 감사 앵커 — 어르신 카드 3장. */
const CARD_FX = [
  { card: '235:152', photo: '235:154', name: '235:156', age: '235:161', meta: '235:158' },
  { card: '235:168', photo: '235:170', name: '235:172', age: '235:181', meta: '235:180' },
  { card: '235:174', photo: '235:176', name: '235:178', age: '235:184', meta: '235:183' },
];

export function AnalysisEldersPage() {
  const { isConfigured } = useAuth();
  const profilesQuery = useProfiles();
  // 담당 어르신은 RLS 로 같은 기관에만 보인다 → 기관명은 내 소속 기관 1건이면 충분하다.
  const org = useOrganization({ enabled: isConfigured });
  const [query, setQuery] = useState('');

  const elders = useMemo(
    () => (profilesQuery.data ?? []).map(toElderProfile),
    [profilesQuery.data],
  );
  const photos = useElderPhotoUrls(elders.map((e) => e.photoPath), isConfigured);
  const shown = elders.filter((e) => e.name.includes(query.trim()));

  const rows = Math.max(Math.ceil(shown.length / COL_X.length), 1);
  const cardHeight = ROW_TOP + rows * ROW_PITCH - (ROW_PITCH - ELDER_H) + CARD_PAD_BOTTOM;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: Y(CARD_TOP) + cardHeight + 87 }}>
      <h1
        data-fx="228:4000"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(186) }}
      >
        개인별 분석
      </h1>
      <p
        data-fx="228:4001"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.23) }}
      >
        어르신을 선택하면 해당 어르신의 개인별 종합 분석·대화기록을 확인할 수 있습니다.
      </p>

      {/* 탭 — 전체 종합 / 개인별(활성) */}
      <Link
        to="/caregiver/analysis"
        data-fx="228:3987"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 426, top: Y(301) }}
      >
        전체 종합 분석
      </Link>
      <span
        data-fx="228:3988"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 598, top: Y(301) }}
      >
        개인별 분석
      </span>
      <div
        data-fx="228:3989"
        className="absolute h-[3px] w-[101px] bg-accent"
        style={{ left: 598, top: Y(340) }}
      />

      <div
        data-fx="228:3993"
        className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardHeight }}
      >
        {/* 이름 검색 */}
        <div
          className="absolute h-[57.06px] w-[335px]"
          style={{ left: COL_X[0], top: 389.38 - CARD_TOP }}
        >
          <img
            src={asset.iconSearch}
            alt=""
            data-fx="228:4012"
            className="pointer-events-none absolute left-[19px] top-[17.62px] block"
            style={{ width: 21.4, height: 22 }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름을 검색하세요"
            aria-label="어르신 이름 검색"
            data-fx="228:4011"
            className="h-full w-full rounded-[10px] border border-line-mid bg-white pl-[47px] pr-4 text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
          />
        </div>

        {shown.length === 0 ? (
          <p
            className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-500"
            style={{ left: COL_X[0], top: ROW_TOP + 16 }}
          >
            {!isConfigured
              ? 'Supabase 연동 후 담당 어르신이 표시됩니다.'
              : query
                ? '검색 결과가 없어요.'
                : '아직 등록된 어르신이 없어요.'}
          </p>
        ) : (
          shown.map((e, i) => {
            const gender = e.gender ? (GENDER_LABEL[e.gender] ?? e.gender) : null;
            const orgName = org.data?.name ?? null;
            return (
              <Link
                key={e.id}
                to={`/caregiver/analysis/${e.id}`}
                data-fx={CARD_FX[i]?.card}
                className="absolute h-[161px] w-[301px] rounded-[10px] bg-white shadow-card transition hover:brightness-[0.98]"
                style={{
                  left: COL_X[i % COL_X.length],
                  top: ROW_TOP + Math.floor(i / COL_X.length) * ROW_PITCH,
                }}
              >
                <Avatar
                  src={e.photoPath ? photos.data?.[e.photoPath] : undefined}
                  name={e.name}
                  size="lg"
                  data-fx={CARD_FX[i]?.photo}
                  className="absolute left-[25px] top-[28px]"
                />
                <span
                  data-fx={CARD_FX[i]?.name}
                  className="absolute left-[115px] top-[16px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
                >
                  {e.name}
                </span>
                <span
                  data-fx={CARD_FX[i]?.age}
                  className="absolute left-[115px] top-[71.54px] whitespace-nowrap text-w-label font-medium leading-[30px] text-ink-400"
                >
                  {/* 태어난 해를 모르면 나이를 만들지 않는다 */}
                  {e.birthYear ? `${e.birthYear}년생 (${elderAge(e)}세)` : '—'}
                </span>
                <span
                  data-fx={CARD_FX[i]?.meta}
                  className="absolute left-[115px] top-[99.57px] whitespace-pre text-w-label font-medium leading-[30px] text-ink-400"
                >
                  {gender && orgName ? `${gender}    l   ${orgName}` : (gender ?? orgName ?? '')}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
