// 요양일지 (Figma 205:1039 — 1440×1025) — 어르신을 골라 일지 목록으로 들어가는 화면
//   제목 @169 · 설명 한 줄 w918 @236.23 · 검색 335×57 @(322,295.29)
//   카드 329×146 r10 shadow-card 3열 @322/684/1047, y395 — 사진 101 @+18,+22 · 글줄 @+134
//   이름 SemiBold 19/30 @+30.42 · 나이 l 성별 Medium 16 @+60.44 · 기관 Medium 16 @+86.47
//
// 카드는 세션 기록(178:787)과 같은 부품이다 — 3번째 줄만 "최근 대화" 대신 **기관명**이다.
// ⚠️ Figma 는 2·3번째 카드의 사진 x 를 710/1080 으로 흘려 놨다(1번째는 +18) → +18 로 통일.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toElderProfile, useOrganization, useProfiles } from '@giokon/data';
import { elderAge } from '@giokon/core';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { Avatar } from '../../components/ui/Avatar';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성' };

/** Figma 실측 감사 앵커 — 카드 3장. */
const CARD_FX = [
  { card: '205:1043', photo: '205:1044', name: '205:1045', meta: '205:1046', org: '205:1047' },
  { card: '205:1049', photo: '205:1050', name: '205:1051', meta: '205:1052', org: '205:1053' },
  { card: '205:1055', photo: '205:1056', name: '205:1057', meta: '205:1058', org: '205:1059' },
];

export function JournalPage() {
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

  return (
    <>
      <PageHeader
        title="요양일지"
        descMax={918}
        description="보호자에게 공개할 요양일지를 기록하고 관리합니다. 어르신을 선택하면 해당 어르신의 요양일지를 확인할 수 있습니다."
      />

      {/* 이름 검색 */}
      <div className="relative mt-[29px] h-[57px] w-[335px]">
        <img
          src={asset.iconSearch}
          alt=""
          width={21.4}
          height={22}
          data-fx="205:1063"
          className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름을 검색하세요"
          aria-label="어르신 이름 검색"
          data-fx="205:1062"
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
          shown.map((e, i) => (
            <Link
              key={e.id}
              data-fx={CARD_FX[i]?.card}
              to={`/caregiver/journal/${e.id}`}
              className="relative h-[146px] w-[329px] rounded-[10px] bg-white shadow-card transition hover:brightness-[0.98]"
            >
              <Avatar
                src={e.photoPath ? photos.data?.[e.photoPath] : undefined}
                name={e.name}
                size="xl"
                px={101}
                data-fx={CARD_FX[i]?.photo}
                className="absolute left-[18px] top-[22px]"
              />
              <div
                data-fx={CARD_FX[i]?.name}
                className="absolute left-[134px] top-[30.42px] whitespace-nowrap text-[19px] font-semibold leading-[30px] text-ink-900"
              >
                {e.name} 어르신
              </div>
              <div
                data-fx={CARD_FX[i]?.meta}
                className="absolute left-[134px] top-[60.44px] whitespace-pre text-w-label font-medium leading-[30px] text-ink-400"
              >
                {elderAge(e)}세
                {e.gender ? `   l   ${GENDER_LABEL[e.gender] ?? e.gender}` : ''}
              </div>
              <div
                data-fx={CARD_FX[i]?.org}
                className="absolute left-[134px] top-[86.47px] whitespace-nowrap text-w-label font-medium leading-[30px] text-ink-400"
              >
                {/* 기관이 없으면 만들지 않는다 */}
                {org.data?.name ?? '—'}
              </div>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
