// 세션 기록 (Figma 178:787 — 1440×1025) — 어르신을 골라 세션 목록으로 들어가는 화면
//   제목 @169 · 설명 한 줄 w723 @236.23 · 검색 335×57 @(322,295.29)
//   카드 329×146 r10 shadow-card 3열 gap 33 @395 — 사진 101 r63 @+18 · 글줄 @+134
//   이름 SemiBold 19/30 · 나이 Medium 16/30 #6e6e6e · 최근 대화 Medium 16/30(3번째 줄 −4)
//
// 카드 자체는 어르신 관리(161:207)와 같은 컴포넌트다 — 배경만 흰색이고 chevron 이 없다.
// ⚠️ Figma 는 이 프레임에서 2·3번째 카드의 안쪽 여백을 26/33 으로 흘려 놨다(1번째는 18).
//    같은 카드 3장이므로 **1번째(어르신 관리와 같은 값)로 통일**한다.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toElderProfile, useProfiles, useRecentSessions } from '@giokon/data';
import { elderAge, relativeDay } from '@giokon/core';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성' };

/** Figma 실측 감사 앵커 — 카드 3장(178:790/796/802). */
const CARD_FX = [
  { card: '178:791', photo: '178:792', name: '178:793', meta: '178:794', recent: '178:795' },
  { card: '178:797', photo: '178:798', name: '178:799', meta: '178:800', recent: '178:801' },
  { card: '178:803', photo: '178:804', name: '178:805', meta: '178:806', recent: '178:807' },
];

export function SessionsPage() {
  const { isConfigured } = useAuth();
  const profilesQuery = useProfiles();
  // 어르신별 "최근 대화"는 세션 전체에서 프로필당 최신 1건이다. PostgREST 로는
  // distinct on 을 못 걸어 전부 받아 접는다 — 기록이 많아지면 뷰/RPC 로 옮긴다.
  const sessions = useRecentSessions({ enabled: isConfigured, fetchAll: true });
  const [query, setQuery] = useState('');

  const elders = useMemo(
    () => (profilesQuery.data ?? []).map(toElderProfile),
    [profilesQuery.data],
  );
  const photos = useElderPhotoUrls(elders.map((e) => e.photoPath), isConfigured);

  /** profile_id → 가장 최근 세션 시각. 없으면 키 자체가 없다(값을 만들지 않는다). */
  const lastByElder = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions.data ?? []) {
      const at = s.planned_date ?? s.started_at;
      const seen = map.get(s.profile_id);
      if (!seen || new Date(at) > new Date(seen)) map.set(s.profile_id, at);
    }
    return map;
  }, [sessions.data]);

  const shown = elders.filter((e) => e.name.includes(query.trim()));

  return (
    <>
      <PageHeader
        title="세션 기록"
        descMax={723}
        description="앱에서 진행된 대화의 전문과 자동 분석을 확인할 수 있습니다. 확인할 어르신을 선택해주세요."
      />

      {/* 이름 검색 */}
      <div className="relative mt-[29px] h-[57px] w-[335px]">
        <img
          src={asset.iconSearch}
          alt=""
          width={21}
          height={22}
          data-fx="178:811"
          className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름을 검색하세요"
          aria-label="어르신 이름 검색"
          data-fx="178:810"
          className="h-full w-full rounded-[10px] border border-line-mid bg-white pl-[47px] pr-4 text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        />
      </div>

      <section className="mt-[43px] flex flex-wrap gap-[33px]">
        {shown.length === 0 ? (
          <p className="w-full rounded-[10px] border border-line bg-white px-[52px] py-16 text-center text-w-body text-ink-500">
            {!isConfigured
              ? 'Supabase 연동 후 담당 어르신이 표시됩니다.'
              : query
                ? '검색 결과가 없어요.'
                : '아직 등록된 어르신이 없어요.'}
          </p>
        ) : (
          shown.map((e, i) => {
            const last = lastByElder.get(e.id);
            return (
              <Link
                key={e.id}
                data-fx={CARD_FX[i]?.card}
                to={`/caregiver/sessions/${e.id}`}
                className="relative flex h-[146px] w-[329px] items-center rounded-[10px] bg-white shadow-card transition hover:brightness-[0.98]"
              >
                <Avatar
                  src={e.photoPath ? photos.data?.[e.photoPath] : undefined}
                  name={e.name}
                  size="xl"
                  px={101}
                  data-fx={CARD_FX[i]?.photo}
                  className="ml-[18px]"
                />
                <div className="ml-[15px]">
                  <div data-fx={CARD_FX[i]?.name} className="text-[19px] font-semibold leading-[30px] text-ink-900">
                    {e.name} 어르신
                  </div>
                  <div data-fx={CARD_FX[i]?.meta} className="text-w-label font-medium leading-[30px] text-ink-400">
                    {elderAge(e)}세
                    {e.gender ? (
                      <span className="whitespace-pre">{`   l   ${GENDER_LABEL[e.gender] ?? e.gender}`}</span>
                    ) : null}
                  </div>
                  <div
                    data-fx={CARD_FX[i]?.recent}
                    className="-mt-[4px] whitespace-pre text-w-label font-medium leading-[30px] text-ink-400"
                  >
                    {/* 대화가 없으면 날짜를 지어내지 않는다 */}
                    {last ? `최근 대화  ${relativeDay(last)}` : '최근 대화  없음'}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </>
  );
}
