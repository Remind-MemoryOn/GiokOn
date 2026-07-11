// 설정 (M9.4 정보주체 권리 포함) — 계정 정보·비밀번호 변경·내 데이터 다운로드(이동권)·
// 계정 삭제 절차 안내·법적 문서 링크.
//
// 데이터 다운로드는 @giokon/core의 buildSubjectDataExport로 이식 가능한 JSON을 만든다.
// 계정 삭제는 기관 재귀속·증빙 보존이 필요한 서버사이드 절차(buildAccountDeletionPlan)
// 라 실행 버튼 대신 절차를 투명하게 안내한다(Edge Function 연동 후 셀프서비스 전환).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Download, UserX, Save, FileText, ShieldCheck } from 'lucide-react';
import { buildAccountDeletionPlan, buildSubjectDataExport } from '@giokon/core';
import {
  updatePassword,
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
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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

  async function changePassword() {
    if (newPassword.length < 8) {
      toast('error', '비밀번호는 8자 이상으로 해주세요.');
      return;
    }
    if (newPassword !== passwordConfirm) {
      toast('error', '비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setChangingPassword(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setPasswordConfirm('');
      toast('success', '비밀번호를 변경했습니다.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '비밀번호 변경 실패');
    } finally {
      setChangingPassword(false);
    }
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">이메일</div>
                <div className="text-slate-800 truncate">{user?.email ?? '—'}</div>
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
          </CardBody>
        </Card>

        {/* 비밀번호 변경 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold flex items-center gap-2">
              <KeyRound size={16} className="text-warm-600" /> 비밀번호 변경
            </h3>
          </div>
          <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <Field label="새 비밀번호" hint="8자 이상">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="새 비밀번호 확인">
              <Input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <div className="sm:col-span-2">
              <Button onClick={changePassword} disabled={changingPassword}>
                {changingPassword ? '변경 중...' : '비밀번호 변경'}
              </Button>
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
