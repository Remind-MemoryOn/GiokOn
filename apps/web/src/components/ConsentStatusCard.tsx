// 어르신 동의 상태 카드 (M9.1·M9.4) — 필수 동의 확보 여부·이력·철회.
//
// 활성 동의 = granted=true && revoked_at 없음. 철회는 삭제가 아니라 revoked_at 기록.

import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, RotateCcw } from 'lucide-react';
import { CONSENT_CATALOG, requiredElderConsents, type ConsentType } from '@giokon/core';
import { useConsents, useRevokeConsent } from '@giokon/data';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { ConsentDialog } from './ConsentDialog';
import { activeConsentTypes } from '../lib/consents';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';

interface Props {
  elderId: string;
  elderName: string;
}

const SUBJECT_LABEL: Record<string, string> = {
  self: '본인',
  guardian: '보호자',
  legal_representative: '성년후견인',
};

export function ConsentStatusCard({ elderId, elderName }: Props) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const consentsQuery = useConsents(isConfigured ? elderId : undefined);
  const revokeConsent = useRevokeConsent();
  const [openDialog, setOpenDialog] = useState(false);

  const required = requiredElderConsents();
  const active = useMemo(() => activeConsentTypes(consentsQuery.data), [consentsQuery.data]);
  const missing = required.filter((t) => !active.includes(t));
  const allGranted = missing.length === 0;

  return (
    <>
      <Card>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              {allGranted && isConfigured ? (
                <ShieldCheck size={16} className="text-emerald-500" />
              ) : (
                <ShieldAlert size={16} className="text-amber-500" />
              )}
              동의 관리
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              대화 세션에는 민감정보(건강·음성)·국외이전·AI 이용 동의가 필요합니다.
            </p>
          </div>
          {!allGranted && isConfigured ? (
            <Button size="sm" onClick={() => setOpenDialog(true)}>
              <ShieldCheck size={14} /> 동의 받기
            </Button>
          ) : null}
        </div>

        <div className="px-5 py-4 space-y-3">
          {!isConfigured ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
              Supabase 연동 후 동의를 기록·확인할 수 있어요. (현재 미연동 — 데모 모드)
            </div>
          ) : consentsQuery.isLoading ? (
            <div className="text-sm text-slate-500 py-2">불러오는 중…</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {required.map((type) => {
                  const ok = active.includes(type);
                  return (
                    <Badge key={type} tone={ok ? 'success' : 'warning'}>
                      {ok ? '✓' : '·'} {CONSENT_CATALOG[type].label.replace(/\(.*\)$/, '')}
                    </Badge>
                  );
                })}
              </div>

              {/* 이력 (최근 5건) */}
              {consentsQuery.data && consentsQuery.data.length > 0 ? (
                <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                  {consentsQuery.data.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 py-2 text-xs">
                      <span className="text-slate-700 flex-1 min-w-0 truncate">
                        {CONSENT_CATALOG[c.consent_type as ConsentType]?.label ?? c.consent_type}
                        <span className="text-slate-400">
                          {' '}
                          · {SUBJECT_LABEL[c.subject_type] ?? c.subject_type}
                          {c.guardian_name ? ` (${c.guardian_name})` : ''} · {c.version}
                        </span>
                      </span>
                      {c.revoked_at ? (
                        <Badge tone="neutral">철회됨</Badge>
                      ) : c.granted ? (
                        <button
                          onClick={() => {
                            if (!confirm('이 동의를 철회할까요? 철회 이력이 보관됩니다.')) return;
                            revokeConsent.mutate(
                              { id: c.id },
                              {
                                onSuccess: () => toast('info', '동의를 철회했습니다.'),
                                onError: (err) =>
                                  toast('error', err instanceof Error ? err.message : '철회 실패'),
                              }
                            );
                          }}
                          className="text-slate-400 hover:text-red-500 inline-flex items-center gap-1"
                        >
                          <RotateCcw size={11} /> 철회
                        </button>
                      ) : (
                        <Badge tone="neutral">미동의</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">아직 기록된 동의가 없습니다.</p>
              )}
            </>
          )}
        </div>
      </Card>

      <ConsentDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        elderId={elderId}
        elderName={elderName}
        granted={active}
      />
    </>
  );
}
