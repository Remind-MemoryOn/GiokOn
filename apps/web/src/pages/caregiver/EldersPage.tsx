// 어르신 관리 (Figma 161:207 — 1440×1025 실측)
//   제목 Bold 30 black @169 · 설명 Regular 20/30 @236
//   검색 335×57 r10 border #cccdce @ (322,295) · 액션 2버튼 @ top188 (205×57 / 177×57)
//   카드 329×146 r10 bg accent 7% shadow-card · 3열 gap 33 · 사진 101 r63
//   합류 승인 대기 배너 1054×56 r10 accent 10% (대기 건이 있을 때만)
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  toElderProfile,
  useClaimElderByCode,
  useCurrentUser,
  useMyPendingAssignments,
  useOrganization,
  useProfiles,
} from '@giokon/data';
import { elderAge } from '@giokon/core';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { Avatar } from '../../components/ui/Avatar';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Input';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { useElderPhotoUrls } from '../../lib/elderPhotos';

const GENDER_LABEL: Record<string, string> = { female: '여성', male: '남성' };

export function EldersPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const profilesQuery = useProfiles();
  const org = useOrganization();
  const currentUser = useCurrentUser();
  const pending = useMyPendingAssignments(isConfigured ? currentUser.data?.id : undefined);
  const claim = useClaimElderByCode();

  const [query, setQuery] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [code, setCode] = useState('');

  const elders = useMemo(
    () => (profilesQuery.data ?? []).map(toElderProfile),
    [profilesQuery.data],
  );
  const photos = useElderPhotoUrls(elders.map((e) => e.photoPath), isConfigured);
  const shown = elders.filter((e) => e.name.includes(query.trim()));
  const pendingCount = pending.data?.length ?? 0;

  function submitClaim() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return toast('error', '어르신 코드를 입력해 주세요.');
    claim.mutate(
      { code: trimmed },
      {
        onSuccess: () => {
          setCode('');
          setClaimOpen(false);
          toast('success', '담당 어르신으로 추가했어요. 기존 기록을 그대로 이어받습니다.');
        },
        onError: (err) => toast('error', err.message),
      },
    );
  }

  return (
    <>
      <PageHeader
        title="어르신 관리"
        description="연대기를 등록해 두면 AI가 그 정보를 바탕으로 대화를 이어갑니다."
        actions={
          <>
            <button
              type="button"
              onClick={() => setClaimOpen(true)}
              className="h-[57px] w-[205px] rounded-[10px] border border-accent bg-white text-[18px] font-semibold leading-[30px] text-accent transition hover:bg-accent-soft"
            >
              코드로 담당 추가
            </button>
            <Link
              to="/caregiver/elders/new"
              className="flex h-[57px] w-[177px] items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent text-[18px] font-semibold leading-[30px] text-white transition hover:brightness-95"
            >
              <span className="text-[25px] leading-none">+</span> 새 어르신 등록
            </Link>
          </>
        }
      />

      {/* 이름 검색 */}
      <div className="relative mt-[26px] h-[57px] w-[335px]">
        <img
          src={asset.iconSearch}
          alt=""
          width={21}
          height={22}
          className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름을 검색하세요"
          aria-label="어르신 이름 검색"
          className="h-full w-full rounded-[10px] border border-line bg-white pl-[47px] pr-4 text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        />
      </div>

      {/* 어르신 카드 그리드 */}
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
          shown.map((e) => (
            <Link
              key={e.id}
              to={`/caregiver/elders/${e.id}`}
              className="relative flex h-[146px] w-[329px] items-center rounded-[10px] bg-accent/[0.07] shadow-card transition hover:brightness-[0.98]"
            >
              <Avatar
                src={e.photoPath ? photos.data?.[e.photoPath] : undefined}
                name={e.name}
                size="xl"
                className="ml-[18px] h-[101px] w-[101px]"
              />
              <div className="ml-[15px]">
                <div className="text-[19px] font-semibold leading-[30px] text-ink-900">
                  {e.name} 어르신
                </div>
                <div className="text-w-label font-medium leading-[30px] text-ink-400">
                  {elderAge(e)}세{e.gender ? `   l   ${GENDER_LABEL[e.gender] ?? e.gender}` : ''}
                </div>
                <div className="text-w-label font-medium leading-[30px] text-ink-400">
                  {org.data?.name ?? '—'}
                </div>
              </div>
              <img
                src={asset.iconChevronRight}
                alt=""
                width={11}
                height={18}
                className="absolute right-[46px] top-[66px]"
              />
            </Link>
          ))
        )}
      </section>

      {/* 기관 합류 승인 대기 */}
      {pendingCount > 0 ? (
        <div className="mt-[52px] flex h-[56px] w-[1054px] items-center rounded-[10px] border border-accent bg-accent/10 px-[51px]">
          <p className="text-w-sub leading-[28px] tracking-[-0.18px] text-accent">
            기관 합류 승인 대기 중이에요 ({pendingCount}건). 기관 담당자가 승인하면 담당 어르신의
            기록을 볼 수 있어요.
          </p>
        </div>
      ) : null}

      {/* 코드로 담당 추가 */}
      <Dialog
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        size="md"
        title="어르신 코드로 담당 추가"
        description="이전 담당 요양보호사에게 받은 코드를 입력하면 기존 어르신·연대기·세션·일지를 그대로 이어받아요."
        footer={
          <>
            <Button variant="outline" onClick={() => setClaimOpen(false)}>
              취소
            </Button>
            <Button onClick={submitClaim} disabled={claim.isPending}>
              {claim.isPending ? '추가 중...' : '담당 추가'}
            </Button>
          </>
        }
      >
        <Field label="어르신 코드" required>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && submitClaim()}
            placeholder="예: K7M2Q9RXTV"
            className="font-mono tracking-[0.2em]"
          />
        </Field>
      </Dialog>
    </>
  );
}
