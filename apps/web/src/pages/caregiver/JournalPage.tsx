// 프로그램 일지 (틀은 요양일지 Figma 205:1039 — 1440×1025) — 어르신을 골라 일지 목록으로 들어가는 화면
//   제목 @169 · 설명 한 줄 w918 @236.23 · 검색 335×57 @(322,295.29) · 카드 3열 @395
//   카드는 세션 기록·공개 관리와 같은 부품(`components/elder-picker.tsx`) —
//   셋째 줄만 **기관명**이다.
// ⚠️ 파일럿 W1(2026-09-26): 확인 대기 일지 수를 **검색 줄 오른쪽**(목록 최상단)과 카드 오른쪽 아래에 둔다.
//    수는 상태로 직접 센다(usePendingJournalCounts) — 최근 N건으로 세면 오래된 대기가 빠진다.
import { useMemo, useState } from 'react';
import { toElderProfile, useOrganization, usePendingJournalCounts, useProfiles } from '@giokon/data';
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
  const pending = usePendingJournalCounts({ enabled: isConfigured });
  /** "확인 대기 N건"을 누르면 확인할 일지가 있는 어르신만 본다. */
  const [pendingOnly, setPendingOnly] = useState(false);

  const elders = useMemo(
    () => (profilesQuery.data ?? []).map(toElderProfile),
    [profilesQuery.data],
  );
  const photos = useElderPhotoUrls(elders.map((e) => e.photoPath), isConfigured);
  const counts = pending.data ?? {};
  const pendingTotal = Object.values(counts).reduce((a, n) => a + n, 0);
  const shown = elders.filter((e) => e.name.includes(query.trim()) && (!pendingOnly || (counts[e.id] ?? 0) > 0));

  return (
    <>
      <PageHeader
        title="프로그램 일지"
        descMax={918}
        description="AI가 만든 프로그램 일지를 확인하고 확정합니다. 어르신을 선택하면 해당 어르신의 일지를 볼 수 있습니다."
      />

      {/* 이름 검색 + 확인 대기 수(카드 3열 폭 1053 오른쪽 끝에 맞춘다) */}
      <div className="mt-[29px] flex w-[1053px] items-center justify-between">
      <div className="relative h-[57px] w-[335px]">
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
      <button
        type="button"
        aria-pressed={pendingOnly}
        disabled={pendingTotal === 0 && !pendingOnly}
        onClick={() => setPendingOnly((v) => !v)}
        className={
          'flex h-[37.02px] items-center gap-[8px] whitespace-nowrap rounded-[5px] border px-[14px] text-[16px] leading-[30px] text-ink-900 disabled:cursor-default ' +
          (pendingOnly ? 'border-accent bg-accent-tint font-semibold' : 'border-line bg-white')
        }
      >
        <span aria-hidden className="h-[8px] w-[8px] rounded-full bg-accent" />
        확인 대기 {pendingTotal}건{pendingOnly ? ' · 전체 보기' : ''}
      </button>
      </div>

      <section className="mt-[43px] flex flex-wrap gap-[33px]">
        <ElderPickerGrid
          elders={shown}
          photos={photos.data}
          fx={CARD_FX}
          to={(e) => `/caregiver/journal/${e.id}`}
          // 기관이 없으면 만들지 않는다
          third={() => org.data?.name ?? '—'}
          badge={(e) =>
            counts[e.id] ? (
              <span className="inline-flex h-[25px] items-center gap-[6px] rounded-pill bg-accent-tint px-[10px] text-[16px] font-semibold text-ink-900">
                <span aria-hidden className="h-[8px] w-[8px] rounded-full bg-accent" />
                <span className="sr-only">확인 </span>대기 {counts[e.id]}건
              </span>
            ) : null
          }
          empty={
            !isConfigured
              ? 'Supabase 연동 후 담당 어르신이 표시됩니다.'
              : pendingOnly
                ? '확인 대기 중인 일지가 있는 어르신이 없어요.'
                : query
                ? '검색 결과가 없어요.'
                : '아직 등록된 어르신이 없어요.'
          }
        />
      </section>
    </>
  );
}
