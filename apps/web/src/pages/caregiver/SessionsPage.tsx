// 세션 기록 (Figma 178:787 — 1440×1025) — 어르신을 골라 세션 목록으로 들어가는 화면
//   제목 @169 · 설명 한 줄 w723 @236.23 · 검색 335×57 @(322,295.29) · 카드 3열 @395
//   카드는 요양일지·공개 관리와 같은 부품(`components/elder-picker.tsx`) —
//   셋째 줄만 **최근 대화**다.
import { useMemo, useState } from 'react';
import { toElderProfile, useProfiles, useRecentSessions } from '@giokon/data';
import { relativeDay } from '@giokon/core';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { ElderPickerGrid } from '../../components/elder-picker';
import { useAuth } from '../../auth/AuthProvider';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

/** Figma 실측 감사 앵커 — 카드 3장(178:790/796/802). */
const CARD_FX = [
  { card: '178:791', photo: '178:792', name: '178:793', meta: '178:794', third: '178:795' },
  { card: '178:797', photo: '178:798', name: '178:799', meta: '178:800', third: '178:801' },
  { card: '178:803', photo: '178:804', name: '178:805', meta: '178:806', third: '178:807' },
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
        <ElderPickerGrid
          elders={shown}
          photos={photos.data}
          fx={CARD_FX}
          to={(e) => `/caregiver/sessions/${e.id}`}
          // 대화가 없으면 날짜를 지어내지 않는다
          third={(e) => {
            const last = lastByElder.get(e.id);
            return last ? `최근 대화  ${relativeDay(last)}` : '최근 대화  없음';
          }}
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
