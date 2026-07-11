// 기관 관리 (M14.2) — 기관 정보(관리자 수정)·구성원 목록·역할.
//
// RLS가 권한을 강제한다: 기관명 수정은 org_admin만 성공하고, 구성원 목록은
// 관리자면 기관 전체·아니면 본인만 보인다. 초대(이메일 발송)는 서버사이드
// 기능이라 Supabase/Edge Function 연동 후 활성화한다.

import { useState } from 'react';
import { Building2, Users, Save, Info } from 'lucide-react';
import {
  useCurrentUser,
  useOrganization,
  useOrgMembers,
  useUpdateOrganization,
  type OrgRole,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';

const ROLE_META: Record<OrgRole, { label: string; tone: 'brand' | 'info' | 'neutral' }> = {
  org_admin: { label: '기관 관리자', tone: 'brand' },
  caregiver: { label: '요양보호사', tone: 'info' },
  guardian: { label: '보호자', tone: 'neutral' },
};

export function OrgPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const orgQuery = useOrganization();
  const membersQuery = useOrgMembers();
  const updateOrg = useUpdateOrganization();

  const isAdmin = currentUser.data?.role === 'org_admin';
  // 사용자가 입력하기 전까지는 서버 값을 그대로 보여준다(effect-setState 회피).
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? orgQuery.data?.name ?? '';

  if (!isConfigured) {
    return (
      <>
        <PageHeader title="기관 관리" description="기관 정보와 구성원을 관리합니다." />
        <div className="flex-1 px-8 py-6">
          <Card>
            <CardBody className="py-14 text-center text-sm text-slate-500">
              Supabase 연동 후 이용할 수 있어요. <code>apps/web/.env</code>를 설정해 주세요.
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  function saveName() {
    if (!orgQuery.data) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast('error', '기관 이름을 입력해 주세요.');
      return;
    }
    updateOrg.mutate(
      { id: orgQuery.data.id, name: trimmed },
      {
        onSuccess: () => {
          setNameDraft(null);
          toast('success', '기관 정보를 저장했습니다.');
        },
        onError: (err) =>
          toast('error', err instanceof Error ? err.message : '저장에 실패했습니다.'),
      }
    );
  }

  return (
    <>
      <PageHeader
        title="기관 관리"
        description="기관 정보와 구성원을 관리합니다. 어르신 데이터는 기관에 귀속됩니다."
      />
      <div className="flex-1 px-8 py-6 space-y-6 overflow-y-auto">
        {/* 기관 정보 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold flex items-center gap-2">
              <Building2 size={16} className="text-warm-600" /> 기관 정보
            </h3>
          </div>
          <CardBody className="space-y-4 max-w-xl">
            {orgQuery.isLoading ? (
              <div className="text-sm text-slate-500">불러오는 중…</div>
            ) : (
              <>
                <Field
                  label="기관 이름"
                  hint={isAdmin ? '요양원·복지관 등 기관 이름' : '기관 관리자만 수정할 수 있어요.'}
                >
                  <div className="flex gap-2">
                    <Input
                      value={name}
                      onChange={(e) => setNameDraft(e.target.value)}
                      disabled={!isAdmin}
                    />
                    {isAdmin ? (
                      <Button onClick={saveName} disabled={updateOrg.isPending}>
                        <Save size={14} /> 저장
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <div className="text-xs text-slate-400">
                  기관 ID: <code>{orgQuery.data?.id}</code>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* 구성원 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Users size={16} className="text-warm-600" /> 구성원
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAdmin
                  ? '기관에 소속된 계정 목록입니다.'
                  : '관리자에게는 기관 전체 구성원이 보입니다.'}
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {membersQuery.isLoading ? (
              <div className="px-5 py-8 text-sm text-slate-500">불러오는 중…</div>
            ) : (membersQuery.data ?? []).length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">구성원이 없습니다.</div>
            ) : (
              (membersQuery.data ?? []).map((m) => {
                const meta = ROLE_META[m.role];
                return (
                  <div key={m.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {m.name.slice(-2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {m.name}
                        {m.id === currentUser.data?.id ? (
                          <span className="text-xs font-normal text-slate-400 ml-1.5">(나)</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{m.email}</div>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                );
              })
            )}
          </div>
          <div className="px-5 py-3.5 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            요양보호사 초대(이메일 발송)는 서버 연동 후 제공됩니다. 지금은 각자 회원가입 후
            관리자가 기관으로 소속을 옮기는 방식으로 운영해 주세요.
          </div>
        </Card>
      </div>
    </>
  );
}
