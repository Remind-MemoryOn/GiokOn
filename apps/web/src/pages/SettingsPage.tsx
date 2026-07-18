// 설정 (M9.4 정보주체 권리 포함) — 계정 정보·내 데이터 다운로드(이동권)·
// 계정 삭제 절차 안내·법적 문서 링크.
//
// 인증 개편(T17.5): 로그인=소셜 3종(구글·카카오·네이버)이라 비밀번호가 없다 —
// 비밀번호 변경 섹션 제거, 연결된 소셜 계정 안내로 대체.
// 데이터 다운로드는 @giokon/core의 buildSubjectDataExport로 이식 가능한 JSON을 만든다.
// 계정 삭제는 기관 재귀속·증빙 보존이 필요한 서버사이드 절차(buildAccountDeletionPlan)
// 라 실행 버튼 대신 절차를 투명하게 안내한다(Edge Function 연동 후 셀프서비스 전환).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, UserX, Save, FileText, ShieldCheck } from 'lucide-react';
import { buildAccountDeletionPlan, buildSubjectDataExport } from '@giokon/core';
import {
  useCurrentUser,
  useMyConsents,
  useOrganization,
  useProfiles,
  useUpdateMyName,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';

const ACTION_LABEL: Record<string, string> = {
  delete: '파기',
  anonymize: '익명화 보존',
  reassign: '기관 재귀속',
  retain: '법정 보존',
};

export function SettingsPage() {
  const { isConfigured, user } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const orgQuery = useOrganization();
  const profilesQuery = useProfiles();
  const myConsents = useMyConsents();
  const updateMyName = useUpdateMyName();

  // 사용자가 입력하기 전까지는 서버 값을 그대로 보여준다(effect-setState 회피).
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? currentUser.data?.name ?? '';

  if (!isConfigured) {
    return (
      <>
        <PageHeader title="설정" description="계정과 데이터 권리를 관리합니다." />
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
    const id = currentUser.data?.id;
    const trimmed = name.trim();
    if (!id || !trimmed) {
      toast('error', '이름을 입력해 주세요.');
      return;
    }
    updateMyName.mutate(
      { id, name: trimmed },
      {
        onSuccess: () => {
          setNameDraft(null);
          toast('success', '이름을 변경했습니다.');
        },
        onError: (err) => toast('error', err instanceof Error ? err.message : '변경 실패'),
      }
    );
  }

  function downloadMyData() {
    const account = currentUser.data;
    if (!account) {
      toast('error', '계정 정보를 불러오지 못했습니다.');
      return;
    }
    const exportData = buildSubjectDataExport({
      subjectUserId: account.id,
      account: { name: account.name, email: account.email, role: account.role },
      elders: profilesQuery.data ?? [],
      consents: myConsents.data ?? [],
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `giokon-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', '내 데이터를 다운로드했습니다.');
  }

  const deletionPlan = buildAccountDeletionPlan();

  return (
    <>
      <PageHeader title="설정" description="계정과 데이터 권리를 관리합니다." />
      <div className="flex-1 px-8 py-6 space-y-6 overflow-y-auto">
        {/* 계정 정보 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold">계정 정보</h3>
          </div>
          <CardBody className="space-y-4 max-w-xl">
            <Field label="이름">
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setNameDraft(e.target.value)} />
                <Button onClick={saveName} disabled={updateMyName.isPending}>
                  <Save size={14} /> 저장
                </Button>
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">이메일</div>
                <div className="text-slate-800 truncate">{user?.email ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">전화번호</div>
                <div className="text-slate-800 truncate">{currentUser.data?.phone ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">역할</div>
                <Badge tone="brand">
                  {currentUser.data?.role === 'org_admin' ? '기관 관리자' : '요양보호사'}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">소속 기관</div>
                <div className="text-slate-800 truncate">{orgQuery.data?.name ?? '—'}</div>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500" style={{ wordBreak: 'keep-all' }}>
              로그인은 소셜 계정(구글·카카오·네이버)으로 이루어지며, 기억온은
              비밀번호를 저장하지 않습니다. 비밀번호 관리(변경·분실)는 각 소셜 계정에서
              해주세요.
            </div>
          </CardBody>
        </Card>

        {/* 정보주체 권리 — 데이터 다운로드(이동권) */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold flex items-center gap-2">
              <Download size={16} className="text-warm-600" /> 내 데이터 다운로드
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              계정 정보·담당 어르신 연대기·동의 이력을 이식 가능한 JSON으로 내려받습니다(개인정보 이동권).
            </p>
          </div>
          <CardBody>
            <Button variant="outline" onClick={downloadMyData}>
              <Download size={14} /> JSON으로 다운로드
            </Button>
          </CardBody>
        </Card>

        {/* 계정 삭제 절차 안내 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold flex items-center gap-2">
              <UserX size={16} className="text-red-500" /> 계정 삭제
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              어르신 데이터는 기관에 귀속되므로 아래 절차로 처리됩니다. 삭제 요청은 기관
              관리자 또는 지원 채널로 접수해 주세요(서버 연동 후 셀프서비스 제공 예정).
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {deletionPlan.map((item) => (
              <div key={item.scope} className="px-5 py-3 flex items-start gap-3 text-sm">
                <Badge
                  tone={item.action === 'delete' ? 'warning' : 'neutral'}
                  className="mt-0.5 shrink-0"
                >
                  {ACTION_LABEL[item.action] ?? item.action}
                </Badge>
                <div>
                  <div className="font-medium text-slate-800">{item.scope}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {item.reason}
                    {item.retention ? ` · ${item.retention}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 법적 문서 */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4 text-sm">
            <ShieldCheck size={16} className="text-warm-600" />
            <Link to="/privacy" className="text-warm-700 hover:underline font-medium">
              개인정보 처리방침
            </Link>
            <Link to="/terms" className="text-warm-700 hover:underline font-medium">
              이용약관
            </Link>
            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
              <FileText size={12} /> 기억온은 의료기기가 아니며, 인지활동 보조 서비스입니다.
            </span>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
