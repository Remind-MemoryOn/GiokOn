// 기본 정보 입력 = 회원가입 마무리 (Figma 15:444 — 1440×1248 실측)
//   제목 SemiBold 25/30 @ (591,194) · 부제 Regular 18 @ (481,232)
//   역할 카드 275×128 r10 @ (432,320)/(733,320) — 라디오 25 + 제목 SemiBold 20 + 설명 16/22
//   입력 576×57 r10 @ 이름 508 · 전화번호 652 · 소속 기관명 798 (라벨 Medium 20 · 힌트 16)
//   동의 박스 576×151 @ 916 · 가입 완료 576×71 accent @ 1106
//
// ⚠️ 이 프레임의 공개 헤더 좌표만 다른 공개 화면(랜딩·로그인)과 다르다(워드마크 63 vs 130).
//    Figma 자체 불일치라 다수(2/3)를 따르는 PublicHeader 로 통일한다.
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { completeOnboarding } from '@giokon/data';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { useAuth } from '../../auth/AuthProvider';
import { routeForUser } from '../../auth/routes';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

type Role = 'caregiver' | 'guardian';

const ROLES: { key: Role; title: string; lines: [string, string]; left: number }[] = [
  {
    key: 'caregiver',
    title: '요양보호사',
    lines: ['어르신·세션·일지를 관리해요.', '소속 기관명을 입력합니다.'],
    left: 432,
  },
  {
    key: 'guardian',
    title: '보호자',
    lines: ['공개된 부모님 소식을 확인해요.', '어르신 코드로 연결합니다.'],
    left: 733,
  },
];

const Y = (v: number) => v - 122;

/** 라벨 + 별표 + 입력 + 힌트 — 실측 좌표로 배치한다. */
function FieldAt({
  label,
  top,
  starLeft,
  value,
  onChange,
  placeholder,
  hint,
  inputProps,
}: {
  label: string;
  top: number;
  starLeft: number;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  return (
    <>
      <label
        className="absolute left-[432px] text-[20px] font-medium leading-[30px] text-ink-900"
        style={{ top: Y(top) }}
      >
        {label}
      </label>
      <span
        className="absolute text-[12px] font-medium leading-[30px] text-accent"
        style={{ left: starLeft, top: Y(top) }}
        aria-hidden
      >
        ✱
      </span>
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="absolute left-[432px] h-[57px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        style={{ top: Y(top + 44) }}
      />
      <p
        className="absolute left-[433px] text-w-label text-ink-500"
        style={{ top: Y(top + 109) }}
      >
        {hint}
      </p>
    </>
  );
}

export function OnboardingPage() {
  const { session, user, userRow, loading, isConfigured, refreshUserRow } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();

  const metaName = (user?.user_metadata?.name as string | undefined)?.trim();
  const metaPhone =
    userRow?.phone?.trim() ||
    (user?.user_metadata?.phone as string | undefined)?.trim() ||
    (user?.user_metadata?.phone_number as string | undefined)?.trim();

  const [role, setRole] = useState<Role>('caregiver');
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [elderCode, setElderCode] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [socialAgreed, setSocialAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const name = nameDraft ?? metaName ?? '';
  const phone = phoneDraft ?? metaPhone ?? '';

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (userRow?.onboarded_at) return <Navigate to={routeForUser(userRow)} replace />;

  async function submit() {
    if (!isConfigured) return;
    if (!name.trim()) return toast('error', '이름을 입력해주세요.');
    if (!phone.trim()) return toast('error', '전화번호를 입력해주세요.');
    if (role === 'caregiver' && !orgName.trim()) return toast('error', '소속 기관명을 입력해주세요.');
    if (!privacyAgreed || !socialAgreed) return toast('error', '필수 동의 항목에 체크해 주세요.');

    setSubmitting(true);
    try {
      await completeOnboarding({
        name: name.trim(),
        phone: phone.trim(),
        role,
        orgName: role === 'caregiver' ? orgName.trim() : undefined,
        elderCode: role === 'guardian' ? elderCode.trim() || undefined : undefined,
      });
      const row = await refreshUserRow();
      toast('success', '가입이 완료되었습니다. 환영합니다!');
      navigate(routeForUser(row), { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '가입 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto h-[1126px] w-full max-w-[1440px]">
        <h1
          className="absolute left-[591px] whitespace-nowrap text-w-section font-semibold leading-[30px] text-ink-900"
          style={{ top: Y(194) }}
        >
          기본 정보를 입력해 주세요
        </h1>
        <p className="absolute left-[481px] w-[477px] text-w-sub text-ink-500" style={{ top: Y(232) }}>
          소셜 로그인은 완료됐어요. 서비스 이용에 필요한 정보만 확인합니다.
        </p>

        <p
          className="absolute left-[432px] text-[20px] font-medium leading-[30px] text-ink-900"
          style={{ top: Y(274) }}
        >
          어떤 역할로 이용하시나요?
        </p>
        {ROLES.map((r) => {
          const on = role === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              aria-pressed={on}
              className={cn(
                'absolute h-[128px] w-[275px] rounded-[10px] border bg-white text-left',
                on ? 'border-accent' : 'border-line',
              )}
              style={{ left: r.left, top: Y(320) }}
            >
              {/* 라디오 — 링 25 + 안쪽 점 13 (Figma 25:348 실측) */}
              <span
                className={cn(
                  'absolute left-[23px] top-[27px] flex h-[25px] w-[25px] items-center justify-center rounded-full border-2',
                  on ? 'border-accent' : 'border-ink-500',
                )}
              >
                <span
                  className={cn('h-[13px] w-[13px] rounded-full', on ? 'bg-accent' : 'bg-ink-500')}
                />
              </span>
              <span
                className={cn(
                  'absolute left-[61px] top-[28px] text-[20px] font-semibold',
                  on ? 'text-accent' : 'text-ink-500',
                )}
              >
                {r.title}
              </span>
              <span className="absolute left-[58px] top-[59px] text-w-label leading-[22px] text-ink-500">
                {r.lines[0]}
                <br />
                {r.lines[1]}
              </span>
            </button>
          );
        })}

        <FieldAt
          label="이름"
          top={464}
          starLeft={468}
          value={name}
          onChange={setNameDraft}
          placeholder="이름을 입력해주세요"
          hint="소셜 계정 이름이 자동 입력됩니다."
          inputProps={{ autoComplete: 'name' }}
        />
        <FieldAt
          label="전화번호"
          top={609}
          starLeft={504}
          value={phone}
          onChange={setPhoneDraft}
          placeholder="010-1234-5678"
          hint="소셜 본인인증 정보가 있으면 자동 입력됩니다. 긴급 연락·계정 확인에만 사용됩니다."
          inputProps={{ type: 'tel', autoComplete: 'tel' }}
        />
        {role === 'caregiver' ? (
          <FieldAt
            label="소속 기관명"
            top={756}
            starLeft={529}
            value={orgName}
            onChange={setOrgName}
            placeholder="예: 햇살 요양원"
            hint="근무하시는 기관(요양원·복지관) 이름을 입력해 주세요."
          />
        ) : (
          <FieldAt
            label="어르신 코드"
            top={756}
            starLeft={529}
            value={elderCode}
            onChange={(v) => setElderCode(v.toUpperCase())}
            placeholder="예: K7M2Q9RXTV"
            hint="요양보호사에게 받은 코드를 입력하면 연결 요청까지 함께 진행됩니다. 나중에 입력해도 돼요."
          />
        )}

        {/* 필수 동의 2건 */}
        <div
          className="absolute left-[432px] h-[151px] w-[576px] rounded-[10px] border border-line bg-white"
          style={{ top: Y(916) }}
        />
        {[
          {
            top: 948,
            checked: privacyAgreed,
            set: setPrivacyAgreed,
            body: (
              <>
                <span className="font-semibold text-ink-900">[필수]</span> 개인정보 수집·이용에
                동의합니다.
              </>
            ),
          },
          {
            top: 985,
            checked: socialAgreed,
            set: setSocialAgreed,
            body: (
              <>
                <span className="font-semibold text-ink-900">[필수]</span> 소셜
                계정(구글·카카오·네이버)에서 이메일·이름을 제공받는 것을
                <br />
                확인했습니다. 비밀번호는 저장되지 않습니다.
              </>
            ),
          },
        ].map((c) => (
          <label
            key={c.top}
            className="absolute left-[458px] flex cursor-pointer items-start gap-[12px]"
            style={{ top: Y(c.top + 4) }}
          >
            <input
              type="checkbox"
              checked={c.checked}
              onChange={(e) => c.set(e.target.checked)}
              className="mt-[3px] h-[17px] w-[17px] shrink-0 accent-accent"
            />
            <span className="text-w-sub leading-[25px] text-ink-500">{c.body}</span>
          </label>
        ))}
        <Link
          to="/guide#privacy"
          target="_blank"
          className="absolute left-[779px] text-w-sub text-[#aeaeae] underline"
          style={{ top: Y(947) }}
        >
          처리방침 보기
        </Link>

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !isConfigured}
          className="absolute left-[432px] h-[71px] w-[576px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          style={{ top: Y(1106) }}
        >
          {submitting ? '처리 중...' : '가입 완료'}
        </button>
      </main>
    </div>
  );
}
