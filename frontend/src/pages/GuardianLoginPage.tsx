import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MessageCircle, ArrowLeft, LogIn } from 'lucide-react';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { useStore } from '../store/store';
import { cn } from '../lib/utils';

export function GuardianLoginPage() {
  const navigate = useNavigate();
  const elders = useStore((s) => s.elders);
  const guardianLogin = useStore((s) => s.guardianLogin);
  const toast = useStore((s) => s.toast);

  const [selectedElderId, setSelectedElderId] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [loading, setLoading] = useState(false);

  const selected = elders.find((e) => e.id === selectedElderId);

  // 어르신에게 등록된 보호자 이름이 있으면 그 이름을 추천
  function pickElder(id: string) {
    setSelectedElderId(id);
    const e = elders.find((x) => x.id === id);
    if (e?.guardian?.name) setGuardianName(e.guardian.name);
  }

  function submit() {
    if (!selectedElderId) {
      toast('error', '부모님을 선택해 주세요.');
      return;
    }
    if (!guardianName.trim()) {
      toast('error', '이름을 입력해 주세요.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      guardianLogin(selectedElderId, guardianName.trim());
      toast('success', `${guardianName} 님, 환영합니다.`);
      navigate('/guardian', { replace: true });
    }, 400);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-rose-50 to-cream-100 flex flex-col">
      <header className="px-6 py-5">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={15} /> 처음으로
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-xl">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-violet-500 items-center justify-center mb-4 shadow-soft">
              <MessageCircle size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">보호자 로그인</h1>
            <p className="text-sm text-slate-500 mt-1.5">
              어머님·아버님께서 어떤 이야기 나누셨는지 확인하세요.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-5">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                어떤 분의 보호자이신가요? <span className="text-red-500">*</span>
              </div>
              {elders.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 bg-slate-50 rounded-xl">
                  아직 등록된 어르신이 없습니다.<br />요양보호사가 먼저 등록해 주세요.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {elders.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => pickElder(e.id)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition',
                        selectedElderId === e.id
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-slate-200 bg-white hover:border-violet-300'
                      )}
                    >
                      <Avatar name={e.name} color={e.avatarColor} size="md" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm">{e.name}</div>
                        <div className="text-xs text-slate-500">
                          {e.birthYear}년생
                          {e.guardian ? ` · ${e.guardian.relation}: ${e.guardian.name}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Field label="보호자 본인 이름" required>
              <Input
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="예: 박민준"
              />
            </Field>

            {selected ? (
              <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 text-sm text-violet-800">
                <strong>{selected.name}</strong> 어르신의 보호자로 들어갑니다.
                {selected.guardian && selected.guardian.name !== guardianName ? (
                  <div className="text-xs text-violet-600 mt-1">
                    등록된 보호자 이름: {selected.guardian.name}
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button onClick={submit} disabled={loading} className="w-full h-12" size="lg">
              <LogIn size={17} /> {loading ? '들어가는 중...' : '들어가기'}
            </Button>
          </div>

          <div className="mt-4 text-xs text-center text-slate-500">
            시연 모드 — 어떤 보호자 이름이어도 로그인됩니다.
          </div>
        </div>
      </main>
    </div>
  );
}
