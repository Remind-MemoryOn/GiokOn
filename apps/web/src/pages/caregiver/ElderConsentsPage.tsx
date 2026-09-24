import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CONSENT_CATALOG,
  CONSENT_SUBJECT_OPTIONS,
  CONSENT_VERSION,
  capacityForSubject,
  consentBasis,
  isCurrentConsent,
  requiredConsents,
  type ConsentSubjectType,
  type ConsentType,
} from '@giokon/core';
import {
  useConsents,
  useCurrentUser,
  useProfile,
  useRecordConsent,
  useRevokeConsent,
  type ConsentRow,
} from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useStore } from '../../store/store';

export function ElderConsentsPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const profile = useProfile(elderId);
  const consents = useConsents(elderId);
  const currentUser = useCurrentUser();
  const recordConsent = useRecordConsent();
  const revoke = useRevokeConsent();
  const toast = useStore((state) => state.toast);
  const [target, setTarget] = useState<{ id: string; type: ConsentType } | null>(null);
  const [grantTarget, setGrantTarget] = useState<ConsentType | null>(null);
  const [grantChecked, setGrantChecked] = useState(false);
  const [consentSubject, setConsentSubject] = useState<ConsentSubjectType>('self');
  const [proxyName, setProxyName] = useState('');
  const [proxyRelation, setProxyRelation] = useState('');
  const detailPath: Record<ConsentType, string> = {
    terms_required: '/terms',
    privacy_required: '/consents/member-privacy',
    elder_privacy_required: '/consents/elder-privacy',
    sensitive_health_voice: '/consents/elder-sensitive',
    cross_border_transfer: '/consents/elder-cross-border',
    ai_processing: '/consents/elder-ai',
    marketing_optional: '/privacy',
  };

  const rows = requiredConsents('elder').map((type) => {
    // DB 의 세션 처리 판정(app.has_processing_consent)과 같은 기준 — 같은 종류의 유효한 증빙만 인정한다.
    const matches = (row: ConsentRow) => row.consent_type === type;
    return {
      type,
      definition: CONSENT_CATALOG[type],
      latest: (consents.data ?? []).find(matches),
      active: (consents.data ?? []).find(
        (row) => matches(row) && isCurrentConsent(row),
      ),
    };
  });

  const openGrant = (type: ConsentType, latest?: ConsentRow) => {
    setGrantTarget(type);
    setGrantChecked(false);
    setConsentSubject(latest?.subject_type ?? 'self');
    setProxyName(latest?.guardian_name ?? '');
    setProxyRelation(latest?.guardian_relation ?? '');
  };

  const submitGrant = async () => {
    if (!grantTarget || !elderId) return;
    if (!grantChecked) return toast('error', '동의서 내용을 확인하고 동의에 체크해 주세요.');
    if (consentSubject !== 'self' && (!proxyName.trim() || !proxyRelation.trim())) {
      return toast('error', '대리 동의자 성명과 어르신과의 관계를 입력해 주세요.');
    }
    const user = currentUser.data;
    if (!user) return toast('error', '로그인 정보를 확인할 수 없습니다.');
    try {
      await recordConsent.mutateAsync({
        profile_id: elderId,
        user_id: user.id,
        org_id: user.org_id,
        consent_type: grantTarget,
        granted: true,
        version: CONSENT_VERSION,
        subject_type: consentSubject,
        capacity: capacityForSubject(consentSubject),
        guardian_name: consentSubject === 'self' ? null : proxyName.trim(),
        guardian_relation: consentSubject === 'self' ? null : proxyRelation.trim(),
        basis: consentBasis(consentSubject),
      });
      toast('success', '동의를 기록했습니다.');
      setGrantTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '동의를 저장하지 못했습니다.';
      toast(
        'error',
        message.includes('elder_privacy_required') && message.includes('consent_type')
          ? '서비스의 어르신 개인정보 동의 설정이 아직 서버에 반영되지 않았습니다.'
          : message,
      );
    }
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="어르신 동의 관리"
        description="어르신 필수 동의를 확인하고, 없는 동의는 기록하며 필요한 경우 개별 동의를 철회합니다. 철회만으로 계정이 로그아웃되지는 않습니다."
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
          {rows.map(({ type, definition, active, latest }) => (
            <article key={type} className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-white p-6 shadow-card">
              <div className="max-w-[760px]">
                <h2 className="text-w-sub font-semibold text-ink-900">{definition.label}</h2>
                <p className="mt-2 text-w-label text-ink-700">{definition.summary}</p>
                <p className="mt-2 text-w-label text-ink-500">{active ? `철회되지 않은 동의 기록 · ${new Date(active.granted_at).toLocaleDateString('ko-KR')}` : '철회되지 않은 동의 기록 없음'}</p>
                <Link to={detailPath[type]} target="_blank" className="mt-2 inline-block text-w-label font-semibold text-accent underline">동의서 상세보기</Link>
              </div>
              <div className="flex items-center gap-3">
                <span
                  aria-label={active ? '동의 완료' : '미동의'}
                  className={`inline-flex min-w-[112px] items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-w-label font-semibold ${
                    active ? 'bg-live-soft text-live' : 'bg-mute text-ink-400'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[13px] leading-none ${
                      active ? 'border-live bg-live text-white' : 'border-ink-400 bg-white'
                    }`}
                  >
                    {active ? '✓' : ''}
                  </span>
                  {active ? '동의 완료' : '미동의'}
                </span>
                {active ? (
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={() => setTarget({ id: active.id, type })}
                    className="rounded-[10px] border border-alert px-5 py-3 text-w-label font-semibold text-alert disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    동의 철회
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openGrant(type, latest)}
                    className="rounded-[10px] border border-accent bg-accent px-5 py-3 text-w-label font-semibold text-white"
                  >
                    {latest ? '다시 동의하기' : '동의하기'}
                  </button>
                )}
              </div>
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
      <Dialog
        open={grantTarget !== null}
        onClose={() => {
          if (!recordConsent.isPending) setGrantTarget(null);
        }}
        title="어르신 동의를 다시 기록합니다"
        description={grantTarget ? CONSENT_CATALOG[grantTarget].label : ''}
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              disabled={recordConsent.isPending}
              onClick={() => setGrantTarget(null)}
            >
              취소
            </Button>
            <Button
              disabled={!grantChecked || recordConsent.isPending}
              onClick={() => void submitGrant()}
            >
              {recordConsent.isPending ? '저장 중...' : '동의 저장'}
            </Button>
          </>
        }
      >
        {grantTarget ? (
          <div className="space-y-5 pb-4">
            <div>
              <p className="mb-2 text-w-label font-semibold text-ink-900">
                동의 주체 <span className="text-accent">(필수)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {CONSENT_SUBJECT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConsentSubject(option.value)}
                    className={`rounded-[10px] border px-4 py-2 text-w-label ${
                      consentSubject === option.value
                        ? 'border-accent text-accent'
                        : 'border-line text-ink-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {consentSubject !== 'self' ? (
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={proxyName}
                  onChange={(event) => setProxyName(event.target.value)}
                  placeholder="대리 동의자 성명 (필수)"
                  className="h-[50px] rounded-[10px] border border-line px-4"
                />
                <input
                  value={proxyRelation}
                  onChange={(event) => setProxyRelation(event.target.value)}
                  placeholder="어르신과의 관계 (필수)"
                  className="h-[50px] rounded-[10px] border border-line px-4"
                />
              </div>
            ) : null}
            <div className="rounded-[10px] border border-line p-4">
              <p className="font-semibold text-ink-900">{CONSENT_CATALOG[grantTarget].label}</p>
              <p className="mt-1 text-w-label leading-6 text-ink-700">
                {CONSENT_CATALOG[grantTarget].summary}
              </p>
              <Link
                to={detailPath[grantTarget]}
                target="_blank"
                className="mt-2 inline-block text-w-label font-semibold text-accent underline"
              >
                동의서 상세보기
              </Link>
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-w-label text-ink-900">
                <input
                  type="checkbox"
                  checked={grantChecked}
                  onChange={(event) => setGrantChecked(event.target.checked)}
                  className="mt-1 h-[17px] w-[17px] accent-accent"
                />
                위 동의서 내용을 확인했으며 해당 처리에 동의합니다. (필수)
              </label>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
