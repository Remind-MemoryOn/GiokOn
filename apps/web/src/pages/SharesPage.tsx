// 데이터 공개 체크리스트 (SCR-W08 — T17.2 / Phase W5)
//
// 요양보호사가 확정 일지·세션 분석 중 보호자에게 공개할 항목을 선별해
// 공개(커밋)하고, 언제든 철회한다(F-26 — 감사 기록은 DB 트리거).
// 공개된 항목만 보호자 화면(SCR-W09)에 나타난다 — 서버 RLS 강제(F-29).

import { useState } from 'react';
import { Eye, EyeOff, Share2, ShieldAlert } from 'lucide-react';
import {
  parseSessionAnalysis,
  toElderProfile,
  useCareJournals,
  useCurrentUser,
  useCreateGuardianShare,
  useGuardianLinks,
  useGuardianShares,
  useProfiles,
  useRevokeGuardianShare,
  useSessionAnalyses,
  type ShareItemType,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { formatKoreanDateTime } from '../lib/utils';
import { cn } from '../lib/utils';

export function SharesPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const profilesQuery = useProfiles();

  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const [elderId, setElderId] = useState<string | null>(null);
  const selected = elders.find((e) => e.id === elderId) ?? null;

  const journals = useCareJournals(isConfigured && elderId ? elderId : undefined);
  const analyses = useSessionAnalyses(isConfigured && elderId ? elderId : undefined);
  const shares = useGuardianShares(isConfigured && elderId ? elderId : undefined);
  const links = useGuardianLinks(isConfigured && elderId ? elderId : undefined);
  const createShare = useCreateGuardianShare();
  const revokeShare = useRevokeGuardianShare();

  const activeShareByItem = new Map(
    (shares.data ?? [])
      .filter((s) => !s.revoked_at)
      .map((s) => [`${s.item_type}:${s.item_id}`, s] as const),
  );
  const approvedGuardians = (links.data ?? []).filter((l) => l.status === 'approved');

  function publish(itemType: ShareItemType, itemId: string) {
    const userId = currentUser.data?.id;
    if (!userId || !selected) return;
    createShare.mutate(
      { shared_by: userId, profile_id: selected.id, item_type: itemType, item_id: itemId },
      {
        onSuccess: () => toast('success', '보호자에게 공개했어요. 언제든 철회할 수 있습니다.'),
        onError: (err) => toast('error', err.message),
      },
    );
  }

  function revoke(shareId: string) {
    const userId = currentUser.data?.id;
    if (!userId) return;
    revokeShare.mutate(
      { id: shareId, userId },
      {
        onSuccess: () => toast('info', '공개를 철회했어요. 보호자 화면에서 즉시 사라집니다.'),
        onError: (err) => toast('error', err.message),
      },
    );
  }

  function ShareToggle({ itemType, itemId }: { itemType: ShareItemType; itemId: string }) {
    const active = activeShareByItem.get(`${itemType}:${itemId}`);
    return active ? (
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone="success">공개됨</Badge>
        <Button size="sm" variant="outline" onClick={() => revoke(active.id)}>
          <EyeOff size={13} /> 철회
        </Button>
      </div>
    ) : (
      <Button size="sm" onClick={() => publish(itemType, itemId)} className="shrink-0">
        <Eye size={13} /> 공개
      </Button>
    );
  }

  return (
    <>
      <PageHeader
        title="공개 관리"
        description="오늘 공개할 일지·분석을 선택하세요. 공개된 항목만 보호자에게 보이며, 언제든 철회할 수 있어요."
      />
      <div className="flex-1 px-8 py-6 space-y-5 overflow-y-auto">
        {!isConfigured ? (
          <Card>
            <CardBody className="py-16 text-center text-sm text-slate-500">
              Supabase 연동 후 공개 관리를 이용할 수 있습니다.
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {elders.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setElderId(e.id)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition',
                    elderId === e.id
                      ? 'bg-warm-500 text-white border-warm-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-warm-300',
                  )}
                >
                  <Avatar name={e.name} color={e.avatarColor} size="sm" />
                  {e.name}
                </button>
              ))}
            </div>

            {!selected ? (
              <Card>
                <CardBody className="py-14 text-center text-sm text-slate-500">
                  어르신을 선택하면 공개할 수 있는 항목이 표시됩니다.
                </CardBody>
              </Card>
            ) : (
              <>
                {approvedGuardians.length === 0 ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2" style={{ wordBreak: 'keep-all' }}>
                    <ShieldAlert size={15} className="shrink-0" />
                    아직 승인된 보호자 연결이 없어요. 공개해도 볼 수 있는 보호자가 없습니다
                    — 어르신 상세에서 초대 코드를 발급해 보세요.
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    연결된 보호자 {approvedGuardians.length}명에게 공개됩니다.
                  </div>
                )}

                {/* 확정 일지 */}
                <Card>
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Share2 size={15} className="text-warm-600" /> 확정 일지
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">초안은 확정 후 공개할 수 있어요.</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(journals.data ?? []).filter((j) => j.status === 'final').length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-slate-500">
                        확정된 일지가 없어요.
                      </div>
                    ) : (
                      (journals.data ?? [])
                        .filter((j) => j.status === 'final')
                        .map((j) => (
                          <div key={j.id} className="px-5 py-3.5 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900">
                                {j.journal_date} 일지
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2" style={{ wordBreak: 'keep-all' }}>
                                {j.content}
                              </p>
                            </div>
                            <ShareToggle itemType="journal" itemId={j.id} />
                          </div>
                        ))
                    )}
                  </div>
                </Card>

                {/* 세션 분석 */}
                <Card>
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-semibold">세션 분석</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      관찰 지표 요약이 보호자에게 그대로 보여요(비의료 언어).
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(analyses.data ?? []).length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-slate-500">
                        아직 도착한 분석이 없어요.
                      </div>
                    ) : (
                      (analyses.data ?? []).map((a) => {
                        const parsed = parseSessionAnalysis(a);
                        return (
                          <div key={a.id} className="px-5 py-3.5 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900">
                                {formatKoreanDateTime(a.created_at)} 분석
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2" style={{ wordBreak: 'keep-all' }}>
                                {parsed?.summary ?? '요약 없음'}
                              </p>
                            </div>
                            <ShareToggle itemType="analysis" itemId={a.id} />
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
