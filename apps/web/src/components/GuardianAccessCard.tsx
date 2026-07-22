// 어르신 코드·담당·보호자 연결 관리 카드 (SCR-W10 — 영속 코드 재설계)
//
// ① 어르신 영속 코드: 상시 표시·복사. 보호자에게 주면 연결 요청, 다른 요양보호사
//    에게 주면 담당 인계(기존 기록 그대로) — 소진되지 않는 하나의 코드.
// ② 담당 요양보호사: 이 어르신을 맡은 요양보호사 목록(배정). 관리자는 해제 가능.
// ③ 보호자 연결: 코드로 들어온 연결 요청 승인/거절, 승인된 보호자 해제.
// 승인 전 보호자는 어떤 데이터도 못 보고, 승인 후에도 공개 커밋 항목만 열람한다.

import { useState } from 'react';
import { Check, Copy, HeartHandshake, KeyRound, RefreshCw, Users } from 'lucide-react';
import {
  useApproveGuardianLink,
  useCurrentUser,
  useElderCode,
  useGuardianLinks,
  useProfileCaregivers,
  useRemoveCaregiverAssignment,
  useRevokeGuardianLink,
  useRotateElderCode,
} from '@giokon/data';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { formatKoreanDateTime } from '../lib/utils';

interface Props {
  elderId: string;
  elderName: string;
}

// 혼동문자 제외 8자 코드(회전 시 클라이언트 생성 — DB unique 로 최종 검증).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function randomCode(seed: string): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    // 렌더 순수성 유지를 위해 seed 기반 의사난수(호출 시점 문자열).
    const n = (seed.charCodeAt(i % seed.length) * (i + 7) + i * 31) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[n];
  }
  return out;
}

export function GuardianAccessCard({ elderId, elderName }: Props) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();

  const elderCode = useElderCode(isConfigured ? elderId : undefined);
  const caregivers = useProfileCaregivers(isConfigured ? elderId : undefined);
  const links = useGuardianLinks(isConfigured ? elderId : undefined);
  const rotate = useRotateElderCode();
  const removeAssignment = useRemoveCaregiverAssignment();
  const approveLink = useApproveGuardianLink();
  const revokeLink = useRevokeGuardianLink();

  const [confirmRotate, setConfirmRotate] = useState(false);

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound size={17} className="text-violet-600" /> 어르신 코드·연결
          </CardTitle>
          <CardDescription>Supabase 연동 후 코드·담당·보호자 연결을 관리할 수 있어요.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const code = elderCode.data?.code ?? null;
  const isAdmin = currentUser.data?.role === 'org_admin';
  const activeCaregivers = (caregivers.data ?? []).filter((c) => c.status === 'active');
  const pendingLinks = (links.data ?? []).filter((l) => l.status === 'pending');
  const approvedLinks = (links.data ?? []).filter((l) => l.status === 'approved');

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast('success', '어르신 코드를 복사했어요.');
    } catch {
      toast('info', `복사가 지원되지 않아요. 코드: ${code}`);
    }
  }

  function doRotate() {
    if (!elderCode.data) return;
    rotate.mutate(
      { id: elderCode.data.id, newCode: randomCode(elderCode.data.id) },
      {
        onSuccess: () => {
          setConfirmRotate(false);
          toast('success', '새 코드로 교체했어요. 기존 보호자 연결은 유지됩니다.');
        },
        onError: (err) => toast('error', err.message),
      },
    );
  }

  function approve(linkId: string) {
    const userId = currentUser.data?.id;
    if (!userId) {
      toast('error', '사용자 정보를 불러오지 못했습니다.');
      return;
    }
    approveLink.mutate(
      { id: linkId, userId },
      {
        onSuccess: () => toast('success', '연결을 승인했어요. 공개 항목을 보호자가 볼 수 있어요.'),
        onError: (err) => toast('error', err.message),
      },
    );
  }

  function rejectLink(linkId: string, label: string) {
    revokeLink.mutate(
      { id: linkId },
      {
        onSuccess: () => toast('success', `${label} 처리했어요.`),
        onError: (err) => toast('error', err.message),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound size={17} className="text-violet-600" /> 어르신 코드·연결
        </CardTitle>
        <CardDescription style={{ wordBreak: 'keep-all' }}>
          {elderName} 어르신의 코드 하나로 보호자 연결과 담당 요양보호사 인계를 처리해요.
          담당이 바뀌거나 늘어도 이 코드로 이어받으면 기록이 그대로 유지됩니다.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-5">
        {/* ① 어르신 코드 */}
        <section>
          <h4 className="text-sm font-semibold text-slate-800 mb-2.5 flex items-center gap-1.5">
            <KeyRound size={14} className="text-slate-400" /> 어르신 코드
          </h4>
          {elderCode.isLoading ? (
            <div className="text-sm text-slate-500 py-3 text-center">불러오는 중...</div>
          ) : !code ? (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              코드를 불러오지 못했어요. (담당으로 배정된 어르신만 코드를 볼 수 있어요.)
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 p-3.5 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xl font-bold tracking-[0.25em] text-slate-900">
                {code}
              </span>
              <span className="flex-1" />
              <Button size="sm" variant="outline" onClick={copyCode}>
                <Copy size={14} /> 코드 복사
              </Button>
              {confirmRotate ? (
                <span className="inline-flex items-center gap-1.5">
                  <Button size="sm" variant="danger" onClick={doRotate} disabled={rotate.isPending}>
                    새 코드로 교체
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(false)}>
                    취소
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(true)} title="코드 교체(유출 대비)">
                  <RefreshCw size={13} /> 코드 교체
                </Button>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5" style={{ wordBreak: 'keep-all' }}>
            보호자에게 주면 "어르신 연결" 요청이 오고, 다른 요양보호사에게 주면 이 어르신을
            담당으로 이어받습니다. 코드는 소진되지 않아요.
          </p>
        </section>

        {/* ② 담당 요양보호사 */}
        <section>
          <h4 className="text-sm font-semibold text-slate-800 mb-2.5 flex items-center gap-1.5">
            <Users size={14} className="text-slate-400" /> 담당 요양보호사
          </h4>
          {caregivers.isLoading ? (
            <div className="text-sm text-slate-500 py-3 text-center">불러오는 중...</div>
          ) : activeCaregivers.length === 0 ? (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              배정된 담당 요양보호사가 없어요.
            </div>
          ) : (
            <ul className="space-y-2">
              {activeCaregivers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {c.caregiver?.name ?? '요양보호사'}
                      {c.caregiver_user_id === currentUser.data?.id ? (
                        <span className="text-xs text-slate-400 font-normal"> · 나</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatKoreanDateTime(c.assigned_at)} 배정
                    </div>
                  </div>
                  {isAdmin && activeCaregivers.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        removeAssignment.mutate(
                          { id: c.id },
                          {
                            onSuccess: () => toast('success', '담당에서 제외했어요.'),
                            onError: (err) => toast('error', err.message),
                          },
                        )
                      }
                    >
                      제외
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ③ 보호자 연결 요청·승인 */}
        <section>
          <h4 className="text-sm font-semibold text-slate-800 mb-2.5 flex items-center gap-1.5">
            <HeartHandshake size={14} className="text-slate-400" /> 보호자 연결
          </h4>
          {links.isLoading ? (
            <div className="text-sm text-slate-500 py-3 text-center">불러오는 중...</div>
          ) : pendingLinks.length === 0 && approvedLinks.length === 0 ? (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              아직 보호자 연결 요청이 없어요.
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingLinks.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {link.guardian?.name ?? '보호자'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {link.guardian?.phone ?? link.guardian?.email ?? ''} · 승인 대기
                    </div>
                  </div>
                  <Button size="sm" onClick={() => approve(link.id)} disabled={approveLink.isPending}>
                    <Check size={14} /> 승인
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectLink(link.id, '거절')}
                    disabled={revokeLink.isPending}
                  >
                    거절
                  </Button>
                </li>
              ))}
              {approvedLinks.map((link) => (
                <li key={link.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {link.guardian?.name ?? '보호자'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {link.guardian?.phone ?? link.guardian?.email ?? ''}
                      {link.approved_at ? ` · ${formatKoreanDateTime(link.approved_at)} 승인` : ''}
                    </div>
                  </div>
                  <Badge tone="success">연결됨</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => rejectLink(link.id, '연결 해제')}
                    disabled={revokeLink.isPending}
                  >
                    해제
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
