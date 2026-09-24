// 요양일지 (Figma 205:1039 — 1440×1025) — 어르신을 골라 일지 목록으로 들어가는 화면
//   제목 @169 · 설명 한 줄 w918 @236.23 · 검색 335×57 @(322,295.29) · 카드 3열 @395
//   카드는 세션 기록·공개 관리와 같은 부품(`components/elder-picker.tsx`) —
//   셋째 줄만 **기관명**이다.
import { useMemo, useState } from 'react';
import { toElderProfile, useOrganization, useProfiles } from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { ElderPickerGrid } from '../../components/elder-picker';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

/** Figma 실측 감사 앵커 — 카드 3장. */
const CARD_FX = [
  { card: '205:1043', photo: '205:1044', name: '205:1045', meta: '205:1046', third: '205:1047' },
  { card: '205:1049', photo: '205:1050', name: '205:1051', meta: '205:1052', third: '205:1053' },
  { card: '205:1055', photo: '205:1056', name: '205:1057', meta: '205:1058', third: '205:1059' },
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
        title="프로그램일지"
        descMax={918}
        description="어르신별 프로그램 활동을 기록하고 관리합니다. 어르신을 선택하면 해당 일지를 확인할 수 있습니다."
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
        <ElderPickerGrid
          elders={shown}
          photos={photos.data}
          fx={CARD_FX}
          to={(e) => `/caregiver/journal/${e.id}`}
          // 기관이 없으면 만들지 않는다
          third={() => org.data?.name ?? '—'}
          empty={
            !isConfigured
              ? 'Supabase 연동 후 담당 어르신이 표시됩니다.'
              : query
                ? '검색 결과가 없어요.'
                : '아직 등록된 어르신이 없어요.'
          }
        />
      </section>
    </>
  );
}
