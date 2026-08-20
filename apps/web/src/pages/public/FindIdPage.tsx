// 아이디(이메일) 찾기 (Figma 111:148)
// 서버 RPC find_login_email 이 이름+전화 정확히 1건 일치일 때만 마스킹 이메일을 준다.
import { useState } from 'react';
import { findLoginEmail } from '@giokon/data';
import { AuthFormScreen } from '../../components/shell/AuthFormScreen';
import { useStore } from '../../store/store';
import { isSupabaseConfigured } from '../../lib/supabase';

export function FindIdPage() {
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ found: boolean; masked?: string } | null>(null);

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 아이디 찾기를 사용할 수 없습니다.');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      toast('error', '이름과 전화번호를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const masked = await findLoginEmail(name, phone);
      setResult(masked ? { found: true, masked } : { found: false });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '조회에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFormScreen
      title="아이디(이메일) 찾기"
      subtitle="가입 시 입력한 이름과 전화번호로 이메일 일부를 확인할 수 있어요."
      fields={[
        { label: '이름', value: name, onChange: setName, placeholder: '이름을 입력해주세요', autoComplete: 'name' },
        { label: '전화번호', value: phone, onChange: setPhone, placeholder: '010-1234-5678', type: 'tel', autoComplete: 'tel' },
      ]}
      submitLabel="아이디 찾기"
      onSubmit={submit}
      submitting={submitting}
      disabled={!isSupabaseConfigured}
      footerLink={{ to: '/forgot-password', label: '비밀번호 찾기' }}
    >
      {result ? (
        <div
          className="absolute left-[431px] w-[576px] rounded-[10px] border px-[29px] py-5 text-w-sub"
          style={{ top: 731 }}
        >
          {result.found ? (
            <span className="text-ink-700">
              가입된 이메일: <strong className="font-mono font-semibold">{result.masked}</strong>
            </span>
          ) : (
            <span className="text-ink-500">
              일치하는 계정을 찾지 못했어요. 이름·전화번호를 확인하거나 소셜 로그인으로
              가입했는지 확인해 주세요.
            </span>
          )}
        </div>
      ) : null}
    </AuthFormScreen>
  );
}
