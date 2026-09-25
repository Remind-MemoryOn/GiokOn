// 비밀번호 찾기 (Figma 111:170) — 가입 이메일로 재설정 링크 발송(Supabase Auth).
import { useState } from 'react';
import { sendPasswordResetEmail } from '@giokon/data';
import { AuthFormScreen } from '../../components/shell/AuthFormScreen';
import { useStore } from '../../store/store';
import { isSupabaseConfigured } from '../../lib/supabase';

export function ForgotPasswordPage() {
  const toast = useStore((s) => s.toast);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 비밀번호 찾기를 사용할 수 없어요.');
      return;
    }
    if (!email.trim()) {
      toast('error', '가입한 이메일을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(email, `${window.location.origin}/reset-password`);
      setSent(true);
      toast('success', '재설정 메일을 보냈어요. 메일의 링크로 새 비밀번호를 설정해 주세요.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '메일 발송에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFormScreen
      title="비밀번호 찾기"
      subtitle="가입한 이메일로 비밀번호 재설정 링크를 보내드려요."
      fields={[
        { label: '이메일(아이디)', value: email, onChange: setEmail, placeholder: '가입한 이메일을 입력해주세요', type: 'email', autoComplete: 'email' },
        { label: '전화번호', value: phone, onChange: setPhone, placeholder: '010-1234-5678', type: 'tel', autoComplete: 'tel' },
      ]}
      submitLabel={sent ? '메일을 다시 보내기' : '재설정 메일 보내기'}
      onSubmit={submit}
      submitting={submitting}
      disabled={!isSupabaseConfigured}
      footerLink={{ to: '/find-id', label: '아이디(이메일) 찾기', top: 796.78 }}
    />
  );
}
