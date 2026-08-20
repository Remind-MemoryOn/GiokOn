// 비밀번호 재설정 (Figma 114:247) — 재설정 메일 링크로 들어온 복구 세션에서 변경.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from '@giokon/data';
import { AuthFormScreen } from '../../components/shell/AuthFormScreen';
import { useStore } from '../../store/store';
import { isSupabaseConfigured } from '../../lib/supabase';

export function ResetPasswordPage() {
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 비밀번호 재설정을 사용할 수 없습니다.');
      return;
    }
    if (password.length < 8) {
      toast('error', '비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== confirm) {
      toast('error', '비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      toast('success', '비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast(
        'error',
        err instanceof Error
          ? err.message
          : '변경에 실패했습니다. 재설정 링크를 다시 요청해 주세요.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFormScreen
      title="비밀번호 재설정"
      subtitle="메일 링크로 들어오셨다면 새 비밀번호를 설정할 수 있어요."
      fields={[
        { label: '새 비밀번호', value: password, onChange: setPassword, placeholder: '새 비밀번호를 입력해주세요', type: 'password', autoComplete: 'new-password' },
        { label: '새 비밀번호 확인', value: confirm, onChange: setConfirm, placeholder: '새 비밀번호 다시 입력해주세요', type: 'password', autoComplete: 'new-password' },
      ]}
      submitLabel="비밀번호 변경"
      onSubmit={submit}
      submitting={submitting}
      disabled={!isSupabaseConfigured}
    />
  );
}
