import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CONSENT_CATALOG, requiredConsents, type ConsentType } from '@giokon/core';
import { useConsents, useProfile, useRevokeConsent } from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useStore } from '../../store/store';

export function ElderConsentsPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const profile = useProfile(elderId);
  const consents = useConsents(elderId);
  const revoke = useRevokeConsent();
  const toast = useStore((state) => state.toast);
  const [target, setTarget] = useState<{ id: string; type: ConsentType } | null>(null);

  const rows = requiredConsents('elder').map((type) => ({
    type,
    definition: CONSENT_CATALOG[type],
    active: (consents.data ?? []).find((row) => row.consent_type === type && row.granted && !row.revoked_at),
  }));

  return (
    <div className="pb-16">
      <PageHeader
        title="어르신 동의 관리"
        description="동의 이력을 확인하고 필요한 경우 개별 동의를 철회합니다. 철회만으로 계정이 로그아웃되지는 않습니다."
      />
      <Link to={`/caregiver/elders/${elderId ?? ''}`} className="mt-3 inline-block text-w-sub font-semibold text-accent underline">
        어르신 상세로 돌아가기
      </Link>
      {profile.isPending || consents.isPending ? (
        <p className="mt-10 text-w-body text-ink-500">동의 상태를 확인하고 있습니다.</p>
      ) : profile.isError || consents.isError ? (
        <div role="alert" className="mt-10 rounded-[10px] border border-alert p-6 text-w-body text-ink-900">
          동의 상태를 불러오지 못했습니다. 빈 화면이 동의가 없다는 뜻은 아닙니다.
          <button type="button" onClick={() => { void profile.refetch(); void consents.refetch(); }} className="ml-3 font-semibold text-accent underline">다시 확인</button>
        </div>
      ) : !profile.data ? (
        <p className="mt-10 text-w-body text-ink-500">어르신 정보를 찾을 수 없습니다.</p>
      ) : (
        <section aria-label={`${profile.data.name} 어르신 동의 목록`} className="mt-10 space-y-4">
          <p className="text-w-body text-ink-700">{profile.data.name} 어르신의 현재 동의 상태입니다. 기존 철회 기록은 삭제하지 않습니다.</p>
          {rows.map(({ type, definition, active }) => (
            <article key={type} className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-white p-6 shadow-card">
              <div className="max-w-[760px]">
                <h2 className="text-w-sub font-semibold text-ink-900">{definition.label}</h2>
                <p className="mt-2 text-w-label text-ink-700">{definition.summary}</p>
                <p className="mt-2 text-w-label text-ink-500">{active ? `철회되지 않은 동의 기록 · ${new Date(active.granted_at).toLocaleDateString('ko-KR')}` : '철회되지 않은 동의 기록 없음'}</p>
              </div>
              <button
                type="button"
                disabled={!active || revoke.isPending}
                onClick={() => active && setTarget({ id: active.id, type })}
                className="rounded-[10px] border border-alert px-5 py-3 text-w-label font-semibold text-alert disabled:cursor-not-allowed disabled:opacity-40"
              >
                동의 철회
              </button>
            </article>
          ))}
          <p className="text-w-label leading-7 text-ink-500">필수 동의를 철회하면 해당 어르신의 새 AI 회상 대화를 시작할 수 없습니다. 진행 중인 세션은 서버의 동의 검사에 따라 종료됩니다.</p>
        </section>
      )}
      <ConfirmDialog
        open={target !== null}
        title="어르신 동의를 철회하시겠습니까?"
        description={target ? `${CONSENT_CATALOG[target.type].label}를 철회합니다. 대화 진행이 중단될 수 있으며, 기존 동의·철회 이력은 보존됩니다.` : ''}
        confirmLabel="동의 철회"
        onClose={() => setTarget(null)}
        onConfirm={() => {
          if (!target) return;
          revoke.mutate({ id: target.id }, {
            onSuccess: () => toast('success', '동의를 철회했습니다.'),
            onError: (error) => toast('error', error.message),
          });
        }}
      />
    </div>
  );
}
