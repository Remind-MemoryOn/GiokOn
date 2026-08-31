// 공개 관리 (Figma 135:1288 — 1440×1025) — 어르신을 골라 공개 항목으로 들어가는 화면
//   제목 @169 · 설명 한 줄 w723 @236.23 · 검색 335×57 @(322,295.29) · 카드 3열 @395
//   카드는 세션 기록·요양일지와 같은 부품 — 셋째 줄은 **기관명**이다.
import { useMemo, useState } from 'react';
import { toElderProfile, useOrganization, useProfiles } from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { ElderPickerGrid } from '../../components/elder-picker';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

/** Figma 실측 감사 앵커 — 카드 3장. */
const CARD_FX = [
  { card: '135:1394', photo: '135:1395', name: '135:1396', meta: '135:1397', third: '135:1398' },
  { card: '135:1400', photo: '135:1401', name: '135:1402', meta: '135:1403', third: '135:1404' },
  { card: '135:1412', photo: '135:1413', name: '135:1414', meta: '135:1415', third: '135:1416' },
];

export function SharesPage() {
  const { isConfigured } = useAuth();
  const profilesQuery = useProfiles();
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
        title="공개 관리"
        descMax={723}
        description="보호자에게 공개할 기록을 관리합니다. 어르신을 선택하면 공개할 수 있는 항목이 표시 됩니다."
      />

      {/* 이름 검색 */}
      <div className="relative mt-[29px] h-[57px] w-[335px]">
        <img
          src={asset.iconSearch}
          alt=""
          width={21.4}
          height={22}
          data-fx="135:1379"
          className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름을 검색하세요"
          aria-label="어르신 이름 검색"
          data-fx="135:1376"
          className="h-full w-full rounded-[10px] border border-line-mid bg-white pl-[47px] pr-4 text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        />
      </div>

      <section className="mt-[43px] flex flex-wrap gap-[33px]">
        <ElderPickerGrid
          elders={shown}
          photos={photos.data}
          fx={CARD_FX}
          to={(e) => `/caregiver/shares/${e.id}`}
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
