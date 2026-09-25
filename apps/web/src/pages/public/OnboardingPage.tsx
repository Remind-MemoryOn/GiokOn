// 기본 정보 입력 = 회원가입 마무리 (Figma 15:444 — 1440×1248 실측)
//   제목 SemiBold 25/30 @ (591,194) · 부제 Regular 18 @ (481,232)
//   역할 카드 275×128 r10 @ (432,320)/(733,320) — 라디오 25 + 제목 SemiBold 20 + 설명 16/22
//   입력 576×57 r10 @ 이름 508 · 전화번호 652 · 소속 기관명 798 (라벨 Medium 20 · 힌트 16)
//   ⚠️ 798 칸은 시안의 '소속 기관명'이 아니라 **초대 코드**다(아래 A안) — 좌표·치수는 시안 그대로.
//   동의 박스 576×151 @ 916 · 가입 완료 576×71 accent @ 1106 — 시안은 동의 **2줄**(개인정보·소셜 확인) 기준이다.
//   ⚠️ 이용약관 줄이 더해져(법무) 3줄이 됐다 → 줄을 시안 간격(36.03)으로 늘어놓고 박스·버튼을 줄 수에서 계산한다
//   (사용자 확정 2026-09-25 — 시안과 다름). 박스 위 여백 32.76 · 아래 여백 32.29 · 버튼까지 38.88 은 시안 값.
//
// ⚠️ 이 프레임의 공개 헤더 좌표만 다른 공개 화면(랜딩·로그인)과 다르다(워드마크 63 vs 130).
//    Figma 자체 불일치라 다수(2/3)를 따르는 PublicHeader 로 통일한다.
//
// A안(사용자 확정 2026-09-25) — 요양보호사는 **초대 코드로만** 가입한다. 기관은 운영자가 만든다(app.provision_org).
// 예전엔 기관명을 입력할 때마다 기관이 새로 생겨 같은 기관이 둘로 갈렸다(운영 '선문대학교' 2개 → 병합).
//   · 운영자가 준 **관리자 코드** → 가입 즉시 그 기관의 기관 관리자
//   · 기관이 준 **직원 코드** → 가입만 끝나고 관리자·센터장 승인 전까지 대기(→ /join-pending)
// 시안(15:444)의 '소속 기관명' 칸 자리·치수는 그대로 두고 내용만 초대 코드로 바꿨다(사용자 확정 — 시안과 다름).
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { completeOnboarding } from '@giokon/data';
import { CONSENT_VERSION } from '@giokon/core';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { useAuth } from '../../auth/AuthProvider';
import { routeForUser } from '../../auth/routes';
import { useStore } from '../../store/store';
import { orgJoinErrorMessage } from '../../lib/orgJoinErrors';
import { cn } from '../../lib/utils';
import { Y } from '../../lib/figmaY';

type Role = 'caregiver' | 'guardian';

/** 동의 박스 실측(15:444): 박스 위 916 · 첫 줄 글자 위 948.76 · 줄 피치 36.03 · 아래 여백 32.29 · 버튼까지 38.88. */
const CONSENT_BOX_TOP = 916;
const CONSENT_FIRST = 948.76;
const CONSENT_PITCH = 36.03;
const CONSENT_PAD_BOTTOM = 32.29;
const CTA_GAP = 38.88;
/** 가입 완료 버튼 아래 본문 여백(시안 1106 버튼 + 71 → 본문 높이 1205). */
const PAGE_PAD_BOTTOM = 1205 - (1106 - 122 + 71);

const ROLES: { key: Role; title: string; lines: [string, string]; left: number; fx: string }[] = [
  {
    key: 'caregiver',
    title: '요양보호사',
    lines: ['어르신·세션·일지를 관리해요.', '초대 코드로 기관에 합류해요.'],
    left: 432,
    fx: '25:382',
  },
  {
    key: 'guardian',
    title: '보호자',
    lines: ['공개된 부모님 소식을 확인해요.', '어르신 코드로 연결합니다.'],
    left: 733,
    fx: '25:389',
  },
];

/** 라벨 + 별표 + 입력 + 도움말 — 넷 다 Figma 실측 좌표를 그대로 받는다.
 *  (Figma 가 넷을 각각 옮겨 놔 오프셋으로 유도할 수 없다. 라인박스도 실측: 라벨 24 · 도움말 19) */
function FieldAt({
  label,
  at,
  value,
  onChange,
  placeholder,
  hint,
  inputProps,
  fx,
}: {
  label: string;
  /** [라벨 top, (미사용) 별표 left, 별표 top, 입력 top, 도움말 top] — Figma 실측 */
  at: [number, number, number, number, number];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  hint: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  /** [라벨, 입력, 도움말] Figma 노드 id — 실측 감사 앵커. */
  fx: [string, string, string];
}) {
  const [labelTop, , starTop, inputTop, hintTop] = at;
  return (
    <>
      <label
        data-fx={fx[0]}
        className="absolute left-[432px] text-[20px] font-medium leading-[24px] text-ink-900"
        style={{ top: Y(labelTop) }}
      >
        {label}
        {/* 별표는 라벨 바로 뒤에 붙고 라인박스만 30(Figma 실측: 라벨보다 위로 올라온다) */}
        <span
          className="absolute left-full text-[12px] font-medium leading-[30px] text-accent"
          style={{ top: starTop - labelTop }}
          aria-hidden
        >
          ✱
        </span>
      </label>
      <input
        data-fx={fx[1]}
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="absolute left-[432px] h-[57px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        style={{ top: Y(inputTop) }}
      />
      <p
        data-fx={fx[2]}
        className="absolute left-[433px] text-w-label leading-[19px] text-ink-500"
        style={{ top: Y(hintTop) }}
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
  const [inviteCode, setInviteCode] = useState('');
  const [elderCode, setElderCode] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [socialAgreed, setSocialAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const name = nameDraft ?? metaName ?? '';
  const phone = phoneDraft ?? metaPhone ?? '';
  const isSocialAccount = user?.app_metadata?.provider !== 'email';

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (userRow?.onboarded_at) return <Navigate to={routeForUser(userRow)} replace />;

  async function submit() {
    if (!isConfigured) return;
    if (!name.trim()) return toast('error', '이름을 입력해 주세요.');
    if (!phone.trim()) return toast('error', '전화번호를 입력해 주세요.');
    const joining = role === 'caregiver';
    if (joining && !inviteCode.trim()) return toast('error', '기관 관리자에게 받은 초대 코드를 입력해 주세요.');
    if (!termsAgreed || !privacyAgreed || (isSocialAccount && !socialAgreed)) return toast('error', '필수 동의 항목에 체크해 주세요.');

    setSubmitting(true);
    try {
      await completeOnboarding({
        name: name.trim(),
        phone: phone.trim(),
        role,
        inviteCode: joining ? inviteCode.trim() : undefined,
        elderCode: role === 'guardian' ? elderCode.trim() || undefined : undefined,
        // 계정 필수 동의를 consents 에 기록한다(C2 — 이전에는 UI 게이트만으로 미기록).
        consents: ['terms_required', 'privacy_required'],
        consentVersion: CONSENT_VERSION,
        socialAcknowledged: isSocialAccount ? socialAgreed : true,
      });
      const row = await refreshUserRow();
      // 관리자 코드는 바로 기관에 들어가고(org_id 있음), 직원 코드는 승인을 기다린다(org_id 없음).
      toast(
        'success',
        joining && !row?.org_id ? '가입이 완료됐어요. 기관 관리자의 합류 승인을 기다려 주세요.' : '가입이 완료됐어요. 환영해요!',
      );
      navigate(routeForUser(row), { replace: true });
    } catch (err) {
      toast('error', orgJoinErrorMessage(err, '가입 처리에 실패했어요.'));
    } finally {
      setSubmitting(false);
    }
  }

  // 동의 줄 수(소셜 계정이면 3줄, 이메일 가입이면 2줄)에서 박스 높이와 가입 완료 버튼 위치를 계산한다.
  const consentRows = isSocialAccount ? 3 : 2;
  const consentBottom =
    CONSENT_FIRST + (consentRows - 1) * CONSENT_PITCH + (isSocialAccount ? 50.04 : 21.02) + CONSENT_PAD_BOTTOM;
  const ctaTop = consentBottom + CTA_GAP;

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto w-full max-w-[1440px]" style={{ height: Y(ctaTop) + 71 + PAGE_PAD_BOTTOM }}>
        <h1
          data-fx="25:250"
          className="absolute left-[591px] whitespace-nowrap text-w-section font-semibold leading-[30px] text-ink-900"
          style={{ top: Y(194) }}
        >
          기본 정보를 입력해 주세요
        </h1>
        <p
          data-fx="25:227"
          className="absolute left-[481px] w-[477px] text-w-sub leading-[21px] text-ink-500"
          style={{ top: Y(232) }}
        >
          소셜 로그인은 완료됐어요. 서비스 이용에 필요한 정보만 확인합니다.
        </p>

        <p
          data-fx="25:256"
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
              data-fx={r.fx}
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
          at={[473.38, 468, 464, 508.41, 573.46]}
          value={name}
          onChange={setNameDraft}
          placeholder="이름을 입력해주세요"
          hint="소셜 계정 이름이 자동 입력됩니다."
          fx={['25:252', '25:253', '25:327']}
          inputProps={{ autoComplete: 'name' }}
        />
        <FieldAt
          label="전화번호"
          at={[616.49, 504, 609, 651.52, 716.57]}
          value={phone}
          onChange={setPhoneDraft}
          placeholder="010-1234-5678"
          hint="소셜 본인인증 정보가 있으면 자동 입력됩니다. 긴급 연락·계정 확인에만 사용됩니다."
          fx={['25:404', '25:405', '25:407']}
          inputProps={{ type: 'tel', autoComplete: 'tel' }}
        />
        {role === 'caregiver' ? (
          <FieldAt
            label="초대 코드"
            at={[763.61, 529, 756, 797.64, 862.69]}
            value={inviteCode}
            onChange={(v) => setInviteCode(v.toUpperCase())}
            placeholder="기관에서 받은 초대 코드"
            hint="기관 관리자(또는 기억온 운영팀)에게 받은 코드를 입력해 주세요."
            fx={['25:415', '25:416', '25:418']}
            inputProps={{ autoComplete: 'off', spellCheck: false }}
          />
        ) : (
          <FieldAt
            label="어르신 코드"
            at={[763.61, 529, 756, 797.64, 862.69]}
            value={elderCode}
            onChange={(v) => setElderCode(v.toUpperCase())}
            placeholder="예: K7M2Q9RXTV"
            hint="요양보호사에게 받은 코드를 입력하면 연결 요청까지 함께 진행됩니다. 나중에 입력해도 돼요."
            fx={['25:415', '25:416', '25:418']}
          />
        )}

        {/* 회원가입 필수 동의: 약관과 개인정보 동의를 분리해 각각 확인한다. */}
        <div
          data-fx="25:421"
          className="absolute left-[432px] w-[576px] rounded-[10px] border border-line bg-white"
          style={{ top: Y(CONSENT_BOX_TOP), height: consentBottom - CONSENT_BOX_TOP }}
        />
        {[
          {
            fx: ['terms-check', 'terms-label'],
            lines: 1,
            leading: 21,
            checked: termsAgreed,
            set: setTermsAgreed,
            label: '이용약관 동의(필수)',
            detail: '/terms',
            detailLabel: '약관 상세보기',
            body: <><span className="font-semibold text-ink-900">[필수]</span> 이용약관에 동의합니다.</>,
          },
          {
            fx: ['25:602', '25:422'],
            lines: 1,
            leading: 21,
            checked: privacyAgreed,
            set: setPrivacyAgreed,
            label: '개인정보 수집·이용 동의(필수)',
            detail: '/consents/member-privacy',
            detailLabel: '수집·이용 상세보기',
            detailFx: '25:428',
            body: (
              <>
                <span className="font-semibold text-ink-900">[필수]</span> 개인정보 수집·이용에
                동의합니다.
              </>
            ),
          },
          ...(isSocialAccount ? [{
            fx: ['25:605', '25:468'],
            lines: 2,
            leading: 25,
            checked: socialAgreed,
            set: setSocialAgreed,
            label: '소셜 계정 정보 제공 확인(필수)',
            detail: '/privacy',
            detailLabel: '처리방침 보기',
            // 두 줄짜리 문장의 첫 줄 위에 링크가 겹쳤다 → 둘째 줄 문장 끝에 둔다.
            detailOnLastLine: true,
            body: (
              <>
                <span className="font-semibold text-ink-900">[필수]</span> 소셜
                계정(구글·카카오·네이버)에서 이메일·이름을 제공받는 것을
                <br />
                확인했습니다. 비밀번호는 저장되지 않습니다.
              </>
            ),
          }] : []),
        ].map((c, i) => {
          // 줄 위치 = 첫 줄 + 피치 × 순번. 체크박스·링크의 오프셋은 시안 실측(한 줄 +3.24 · 두 줄 +5.21 · 링크 -2).
          const textTop = CONSENT_FIRST + i * CONSENT_PITCH;
          const checkTop = textTop + (c.lines === 2 ? 5.21 : 3.24);
          const detailTop = 'detailOnLastLine' in c ? textTop + c.leading + (c.leading - 21) / 2 : textTop - 2;
          return (
          <div key={c.fx[0]}>
            <input
              id={`consent-${c.fx[0]}`}
              data-fx={c.fx[0]}
              type="checkbox"
              checked={c.checked}
              onChange={(e) => c.set(e.target.checked)}
              aria-label={c.label}
              className="absolute left-[458px] h-[17px] w-[17px] cursor-pointer accent-accent"
              style={{ top: Y(checkTop) }}
            />
            <label
              htmlFor={`consent-${c.fx[0]}`}
              data-fx={c.fx[1]}
              className="absolute left-[487px] cursor-pointer text-w-sub text-ink-500"
              style={{ top: Y(textTop), lineHeight: `${c.leading}px` }}
            >
              {c.body}
            </label>
            <Link
              data-fx={'detailFx' in c ? c.detailFx : undefined}
              to={c.detail}
              target="_blank"
              className="absolute text-w-label leading-[21px] text-[#8a8a8a] underline"
              style={{
                left: 'detailFx' in c ? 779 : 829,
                top: Y(detailTop),
              }}
            >
              {c.detailLabel}
            </Link>
          </div>
          );
        })}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !isConfigured}
          data-fx="41:117"
          className="absolute left-[432px] h-[71px] w-[576px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          style={{ top: Y(ctaTop) }}
        >
          {submitting ? '처리 중...' : '가입 완료'}
        </button>
      </main>
    </div>
  );
}
