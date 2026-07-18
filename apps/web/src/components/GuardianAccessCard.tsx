// 보호자 초대·승인 관리 카드 (SCR-W10 — T17.1·T17.7 UI)
//
// 어르신 상세에서 사용: ① 초대 코드 발급(1회성·72h) + QR/링크 복사
// ② 연결 요청 승인/거절 ③ 승인된 보호자 해제. 승인 전 보호자는 어떤 데이터도
// 볼 수 없고, 승인 후에도 공개 커밋(guardian_shares) 항목만 열람한다.

import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Check, Copy, HeartHandshake, QrCode, Ticket, X } from 'lucide-react';
import {
  useApproveGuardianLink,
  useCreateGuardianInvite,
  useCurrentUser,
  useGuardianInvites,
  useGuardianLinks,
  useRevokeGuardianInvite,
  useRevokeGuardianLink,
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

export function GuardianAccessCard({ elderId, elderName }: Props) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();

  const invites = useGuardianInvites(isConfigured ? elderId : undefined);
  const links = useGuardianLinks(isConfigured ? elderId : undefined);
  const createInvite = useCreateGuardianInvite();
  const revokeInvite = useRevokeGuardianInvite();
  const approveLink = useApproveGuardianLink();
  const revokeLink = useRevokeGuardianLink();

  const [qrInviteId, setQrInviteId] = useState<string | null>(null);
  // 만료 판정 기준 시각(렌더 순수성 유지 — 72h 창이라 마운트 시각 정밀도면 충분).
  const [mountedAt] = useState(() => Date.now());

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartHandshake size={17} className="text-violet-600" /> 보호자 연결
          </CardTitle>
          <CardDescription>Supabase 연동 후 초대 코드 발급·승인을 관리할 수 있어요.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeInvites = (invites.data ?? []).filter(
    (i) => !i.used_at && !i.revoked_at && new Date(i.expires_at).getTime() > mountedAt,
  );
  const pendingLinks = (links.data ?? []).filter((l) => l.status === 'pending');
  const approvedLinks = (links.data ?? []).filter((l) => l.status === 'approved');

  function issue() {
    const userId = currentUser.data?.id;
    if (!userId) {
      toast('error', '사용자 정보를 불러오지 못했습니다.');
      return;
    }
    createInvite.mutate(
      { profileId: elderId, createdBy: userId },
      {
        onSuccess: (row) => {
          setQrInviteId(row.id);
          toast('success', `초대 코드가 발급됐어요: ${row.code}`);
        },
        onError: (err) => toast('error', err.message),
      },
    );
  }

  async function copyJoinUrl(codeValue: string) {
    const url = `${window.location.origin}/join/${codeValue}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('success', '초대 링크를 복사했어요.');
    } catch {
      toast('info', `복사가 지원되지 않아요. 링크: ${url}`);
    }
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
        onSuccess: () => toast('success', '연결을 승인했어요. 이제 공개 항목을 보호자가 볼 수 있어요.'),
        onError: (err) => toast('error', err.message),
      },
    );
  }

  function reject(linkId: string, label: string) {
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
          <HeartHandshake size={17} className="text-violet-600" /> 보호자 연결
        </CardTitle>
        <CardDescription style={{ wordBreak: 'keep-all' }}>
          초대 코드(QR)를 전달하고, 연결 요청을 승인하면 보호자가 {elderName} 어르신의
          공개된 소식만 볼 수 있어요.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-5">
        {/* 초대 코드 */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Ticket size={14} className="text-slate-400" /> 초대 코드
            </h4>
            <Button size="sm" onClick={issue} disabled={createInvite.isPending}>
              {createInvite.isPending ? '발급 중...' : '초대 코드 발급'}
            </Button>
          </div>

          {invites.isLoading ? (
            <div className="text-sm text-slate-500 py-3 text-center">불러오는 중...</div>
          ) : activeInvites.length === 0 ? (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3" style={{ wordBreak: 'keep-all' }}>
              사용 가능한 초대 코드가 없어요. 발급하면 72시간 동안 1회 사용할 수 있습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {activeInvites.map((invite) => (
                <li key={invite.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold tracking-[0.2em] text-slate-900">
                      {invite.code}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatKoreanDateTime(invite.expires_at)} 까지
                    </span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={() => copyJoinUrl(invite.code)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                      title="초대 링크 복사"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrInviteId(qrInviteId === invite.id ? null : invite.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                      title="QR 보기"
                    >
                      <QrCode size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        revokeInvite.mutate(
                          { id: invite.id },
                          {
                            onSuccess: () => toast('success', '초대 코드를 취소했어요.'),
                            onError: (err) => toast('error', err.message),
                          },
                        )
                      }
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"
                      title="코드 취소"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  {qrInviteId === invite.id ? (
                    <div className="mt-3 flex flex-col items-center gap-2 py-2">
                      <QRCodeCanvas
                        value={`${window.location.origin}/join/${invite.code}`}
                        size={148}
                        marginSize={2}
                      />
                      <span className="text-[11px] text-slate-400">
                        보호자 휴대폰으로 스캔하면 연결 화면이 열려요.
                      </span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 연결 요청·승인 */}
        <section>
          <h4 className="text-sm font-semibold text-slate-800 mb-2.5">연결 상태</h4>
          {links.isLoading ? (
            <div className="text-sm text-slate-500 py-3 text-center">불러오는 중...</div>
          ) : pendingLinks.length === 0 && approvedLinks.length === 0 ? (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              아직 연결 요청이 없어요.
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
                  <Button
                    size="sm"
                    onClick={() => approve(link.id)}
                    disabled={approveLink.isPending}
                  >
                    <Check size={14} /> 승인
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject(link.id, '거절')}
                    disabled={revokeLink.isPending}
                  >
                    거절
                  </Button>
                </li>
              ))}
              {approvedLinks.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5"
                >
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
                    onClick={() => reject(link.id, '연결 해제')}
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
