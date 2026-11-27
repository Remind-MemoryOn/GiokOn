// 계정 삭제 요청 — Google Play 계정 삭제 정책의 **웹 경로**(앱을 지웠어도 요청할 수 있어야 한다, 2026-11-27).
//
// 시안이 없는 공개 화면이다 — 법적 고지 페이지(LegalPages)와 같은 카드 체계로 최소 구현한다(임의 재디자인 금지).
// 비로그인으로도 읽을 수 있다: 요청 방법(앱·웹·이메일) · 처리 기준 · 처리 기간.
// 로그인하면 이 화면에서 바로 접수한다(본인 명의 비공개 문의 — `@giokon/data` requestAccountDeletion, 중복 접수 없음).
// 가입을 끝내지 못한 계정·합류 대기 계정도 로그인 후 이 화면으로 돌아온다(`auth/routes.ts` ACCOUNT_DELETION_PATH).
// 처리 기준 문구는 앱 요청 화면과 같은 core `ACCOUNT_DELETION_DATA_RULES` 다. 운영 처리는
// `docs/runbooks/account-deletion-and-ai-reports.md`.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCOUNT_DELETION_DATA_RULES } from '@giokon/core';
import { ORG_ROLE_LABEL, findPendingAccountDeletionRequest, requestAccountDeletion, useOrganization } from '@giokon/data';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { PublicFooter } from '../../components/shell/PublicFooter';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../auth/AuthProvider';
import { ACCOUNT_DELETION_PATH, loginPath } from '../../auth/routes';
import { useStore } from '../../store/store';
import { errorText } from '../../lib/errorText';
import { PRIVACY_CONTACT_EMAIL } from '../../content/supportContact';

function seoulDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
}

export function AccountDeletionPage() {
  const { session, userRow, loading, isConfigured } = useAuth();
  const uid = session?.user.id ?? null;
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const org = useOrganization({ enabled: isConfigured && !!userRow?.org_id });

  const pending = useQuery({
    queryKey: ['account-deletion', 'pending', uid],
    queryFn: () => findPendingAccountDeletionRequest(uid!),
    enabled: isConfigured && !!uid,
  });
  const request = useMutation({
    mutationFn: () =>
      requestAccountDeletion(uid!, {
        email: userRow?.email ?? session?.user.email ?? null,
        role: userRow ? ORG_ROLE_LABEL[userRow.role] : null,
        orgName: org.data?.name ?? null,
        source: 'web',
      }),
    onSuccess: (r) => {
      toast('success', r.status === 'created' ? '계정 삭제 요청을 보냈어요.' : '이미 접수된 요청이 있어요.');
      void qc.invalidateQueries({ queryKey: ['account-deletion', 'pending', uid] });
    },
    onError: (err) => toast('error', errorText(err)),
  });
  const pendingAt = pending.data?.created_at ?? null;

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1204px] px-6 py-20">
        <article className="rounded-[10px] bg-white px-8 py-12 shadow-card md:px-16 md:py-14" style={{ wordBreak: 'keep-all' }}>
          <h1 className="text-[34px] font-bold text-ink-900 md:text-[38px]">계정 삭제 요청</h1>
          <p className="mt-3 text-w-label text-ink-500">기억온(Giok On) · 기억온 프로젝트팀</p>
          <p className="mt-8 text-w-body leading-8 text-ink-700">
            기억온 앱·웹 계정과 관련 데이터의 삭제를 요청할 수 있어요. 요청을 받으면 본인 여부를 확인한 뒤 요청을 받은 날부터
            10일 이내에 처리하고, 결과를 가입하신 이메일로 알려 드려요.
          </p>

          <h2 className="pt-10 text-w-nav font-bold leading-8 text-ink-900">요청하는 방법</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-w-body leading-8 text-ink-700">
            <li>
              <b>앱에서</b>: 메인 화면 오른쪽 위 톱니바퀴(설정) → <b>계정</b> → <b>계정 삭제 요청</b> → ‘계정 삭제 요청 보내기’
            </li>
            <li>
              <b>웹에서</b>: 이 페이지에서 로그인한 뒤 아래 ‘계정 삭제 요청 보내기’
            </li>
            <li>
              <b>로그인할 수 없다면</b>: 가입한 이메일 주소로{' '}
              <a className="font-semibold text-accent underline" href={`mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent('[기억온] 계정 삭제 요청')}`}>
                {PRIVACY_CONTACT_EMAIL}
              </a>
              에 ‘계정 삭제 요청’ 제목으로 메일을 보내 주세요. 본인 확인을 위해 가입한 이메일에서 보내 주셔야 해요.
            </li>
          </ol>

          <h2 className="pt-10 text-w-nav font-bold leading-8 text-ink-900">삭제되는 정보와 남는 정보</h2>
          <div className="mt-3 divide-y divide-line rounded-[10px] border border-line">
            {ACCOUNT_DELETION_DATA_RULES.map((rule) => (
              <div key={rule.action} className="flex flex-col gap-1 px-6 py-5 md:flex-row md:gap-8">
                <span className="w-[120px] shrink-0 text-w-body font-semibold leading-8 text-ink-900">{rule.action}</span>
                <div>
                  <p className="text-w-body leading-8 text-ink-900">{rule.items}</p>
                  <p className="text-w-label leading-7 text-ink-500">{rule.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-w-label leading-7 text-ink-500">
            자세한 보유 기간은 <Link to="/privacy" className="font-semibold text-accent underline">개인정보 처리방침</Link>을 따릅니다.
          </p>

          <h2 className="pt-10 text-w-nav font-bold leading-8 text-ink-900">요청 보내기</h2>
          {loading ? null : !uid ? (
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
              <Button size="sm" onClick={() => navigate(loginPath(ACCOUNT_DELETION_PATH))}>
                로그인하고 요청하기
              </Button>
              <span className="text-w-label text-ink-500">로그인 후 이 페이지로 돌아와요.</span>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-w-body leading-8 text-ink-700" role="status">
                {pending.isLoading
                  ? '접수 상태를 확인하고 있어요.'
                  : pending.isError
                    ? '접수 상태를 확인하지 못했어요. 요청을 보내면 중복 없이 접수돼요.'
                    : pendingAt
                      ? `${seoulDate(pendingAt)}에 접수된 요청을 처리하고 있어요.`
                      : '접수된 요청이 없어요.'}
              </p>
              <Button
                variant="danger"
                size="sm"
                disabled={pending.isLoading || !!pendingAt || request.isPending}
                onClick={() => setConfirming(true)}
              >
                {pendingAt ? '요청 접수됨' : request.isPending ? '보내는 중…' : '계정 삭제 요청 보내기'}
              </Button>
            </div>
          )}
        </article>
      </main>
      <PublicFooter />
      <ConfirmDialog
        open={confirming}
        title="계정 삭제를 요청할까요?"
        description="처리가 끝나면 이 계정으로 다시 로그인할 수 없어요. 기관에 귀속된 어르신 기록은 기관에 남아요."
        confirmLabel="삭제 요청"
        onConfirm={() => request.mutate()}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
