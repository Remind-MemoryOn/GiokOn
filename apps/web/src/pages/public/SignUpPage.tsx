// 이메일 회원가입 — Figma 에 전용 프레임이 없다(시안의 "회원가입" 링크는 소셜 가입 전제).
// 로그인 화면이 /signup 을 가리키고 있어 경로가 비면 이메일 가입이 아예 불가능했다.
// 새 치수를 만들지 않고 아이디/비밀번호 찾기(111:148·111:170)의 실측 골격을
// 입력 한 칸만 연장해서 쓴다 — AuthFormScreen 참조.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { signUpWithEmail } from '@giokon/data';
import { AuthFormScreen } from '../../components/shell/AuthFormScreen';
import { useAuth } from '../../auth/AuthProvider';
import { routeForUser } from '../../auth/routes';
import { useStore } from '../../store/store';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Y } from '../../lib/figmaY';

export function SignUpPage() {
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const { session, userRow, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // 이미 로그인돼 있으면 가입 화면을 보여줄 이유가 없다(온보딩 미완료면 그쪽으로).
  if (loading) return null;
  if (session) return <Navigate to={routeForUser(userRow)} replace />;

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 회원가입을 사용할 수 없어요.');
      return;
    }
    const addr = email.trim();
    if (!addr || !addr.includes('@')) {
      toast('error', '가입할 이메일(아이디)을 입력해 주세요.');
      return;
    }
    if (password.length < 8) {
      toast('error', '비밀번호는 8자 이상이어야 해요.');
      return;
    }
    if (password !== confirm) {
      toast('error', '비밀번호가 일치하지 않아요.');
      return;
    }
    setSubmitting(true);
    try {
      const { needsConfirm } = await signUpWithEmail({
        email: addr,
        password,
        // 확인 메일의 링크는 곧바로 기본 정보 입력(온보딩)으로 들어온다.
        redirectTo: `${window.location.origin}/onboarding`,
      });
      if (needsConfirm) {
        setSentTo(addr);
        toast('success', '확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 마쳐 주세요.');
        return;
      }
      // 이메일 확인이 꺼진 프로젝트에선 곧바로 세션이 생긴다 → 기본 정보 입력으로.
      toast('success', '가입했어요. 기본 정보를 입력해 주세요.');
      navigate('/onboarding', { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '회원가입에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFormScreen
      title="회원가입"
      subtitle="이메일과 비밀번호를 입력하면 기본 정보 입력으로 이어져요."
      fields={[
        {
          label: '이메일(아이디)',
          value: email,
          onChange: setEmail,
          placeholder: '이메일을 입력해주세요',
          type: 'email',
          autoComplete: 'email',
        },
        {
          label: '비밀번호',
          value: password,
          onChange: setPassword,
          placeholder: '8자 이상 입력해주세요',
          type: 'password',
          autoComplete: 'new-password',
        },
        {
          label: '비밀번호 확인',
          value: confirm,
          onChange: setConfirm,
          placeholder: '비밀번호를 다시 입력해주세요',
          type: 'password',
          autoComplete: 'new-password',
        },
      ]}
      submitLabel={sentTo ? '확인 메일 다시 보내기' : '가입하기'}
      onSubmit={submit}
      submitting={submitting}
      disabled={!isSupabaseConfigured}
      footerLink={{ to: '/login', prefix: '이미 계정이 있으신가요?', label: '로그인' }}
    >
      {/* 마지막 입력(689+57) 과 CTA(801) 사이 — 결과 안내만 들어간다. */}
      {sentTo ? (
        <p
          role="status"
          className="absolute left-[431px] w-[576px] text-w-body leading-[21px] text-ink-700"
          style={{ top: Y(757) }}
        >
          <b className="font-semibold">{sentTo}</b> 으로 확인 메일을 보냈어요. 메일의 링크를 누르면
          기본 정보 입력으로 이어집니다.
        </p>
      ) : null}
    </AuthFormScreen>
  );
}
