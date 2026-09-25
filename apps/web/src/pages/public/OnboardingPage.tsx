// 기본 정보 입력 = 회원가입 마무리 (Figma 15:444 — 1440×1248 실측)
//   제목 SemiBold 25/30 @ (591,194) · 부제 Regular 18 @ (481,232)
//   역할 카드 275×128 r10 @ (432,320)/(733,320) — 라디오 25 + 제목 SemiBold 20 + 설명 16/22
//   입력 576×57 r10 @ 이름 508 · 전화번호 652 · 소속 기관명 798 (라벨 Medium 20 · 힌트 16)
//   동의 박스 576×151 @ 916 · 가입 완료 576×71 accent @ 1106
//
// ⚠️ 이 프레임의 공개 헤더 좌표만 다른 공개 화면(랜딩·로그인)과 다르다(워드마크 63 vs 130).
//    Figma 자체 불일치라 다수(2/3)를 따르는 PublicHeader 로 통일한다.
//
// 파일럿 W9 — 요양보호사는 **새 기관 만들기 / 초대 코드로 합류** 중 하나를 고른다. 시안에 없는 선택이라
// 좌표는 하나도 옮기지 않고, '소속 기관명' 라벨 줄 오른쪽의 전환 링크와 같은 칸의 입력 내용만 바꾼다.
// 합류는 가입만 끝내고 기관·역할은 관리자·센터장 승인 전까지 정하지 않는다(→ /join-pending).
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

const ROLES: { key: Role; title: string; lines: [string, string]; left: number; fx: string }[] = [
  {
    key: 'caregiver',
    title: '요양보호사',
    lines: ['어르신·세션·일지를 관리해요.', '소속 기관명을 입력합니다.'],
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
  const [orgName, setOrgName] = useState('');
  const [joinMode, setJoinMode] = useState<'new' | 'invite'>('new');
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
    const joining = role === 'caregiver' && joinMode === 'invite';
    if (role === 'caregiver' && !joining && !orgName.trim()) return toast('error', '소속 기관명을 입력해 주세요.');
    if (joining && !inviteCode.trim()) return toast('error', '기관 관리자에게 받은 초대 코드를 입력해 주세요.');
    if (!termsAgreed || !privacyAgreed || (isSocialAccount && !socialAgreed)) return toast('error', '필수 동의 항목에 체크해 주세요.');

    setSubmitting(true);
    try {
      await completeOnboarding({
        name: name.trim(),
        phone: phone.trim(),
        role,
        orgName: role === 'caregiver' && !joining ? orgName.trim() : undefined,
        inviteCode: joining ? inviteCode.trim() : undefined,
        elderCode: role === 'guardian' ? elderCode.trim() || undefined : undefined,
        // 계정 필수 동의를 consents 에 기록한다(C2 — 이전에는 UI 게이트만으로 미기록).
        consents: ['terms_required', 'privacy_required'],
        consentVersion: CONSENT_VERSION,
        socialAcknowledged: isSocialAccount ? socialAgreed : true,
      });
      const row = await refreshUserRow();
      toast(
        'success',
        joining ? '가입이 완료됐어요. 기관 관리자의 합류 승인을 기다려 주세요.' : '가입이 완료됐어요. 환영해요!',
      );
      navigate(routeForUser(row), { replace: true });
    } catch (err) {
      toast('error', orgJoinErrorMessage(err, '가입 처리에 실패했어요.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="relative mx-auto h-[1205px] w-full max-w-[1440px]">
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
        {role === 'caregiver' && joinMode === 'invite' ? (
          <FieldAt
            label="초대 코드"
            at={[763.61, 529, 756, 797.64, 862.69]}
            value={inviteCode}
            onChange={(v) => setInviteCode(v.toUpperCase())}
            placeholder="기관 관리자에게 받은 코드"
            hint="관리자·센터장이 승인하면 그 기관의 어르신 기록을 함께 보게 됩니다. 승인 전에는 대기 화면만 보여요."
            fx={['25:415', '25:416', '25:418']}
            inputProps={{ autoComplete: 'off', spellCheck: false }}
          />
        ) : role === 'caregiver' ? (
          <FieldAt
            label="소속 기관명"
            at={[763.61, 529, 756, 797.64, 862.69]}
            value={orgName}
            onChange={setOrgName}
            placeholder="예: 햇살 요양원"
            hint="근무하시는 기관(요양원·복지관) 이름을 입력해 주세요."
            fx={['25:415', '25:416', '25:418']}
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
        {role === 'caregiver' ? (
          // 새 기관 / 초대 코드 합류 전환 — 라벨 줄 오른쪽(입력 칸 오른쪽 끝 1008 에 맞춤). 상세보기 링크와 같은 글꼴·색.
          <button
            type="button"
            onClick={() => setJoinMode((m) => (m === 'new' ? 'invite' : 'new'))}
            aria-pressed={joinMode === 'invite'}
            className="absolute left-[788px] w-[220px] text-right text-w-label leading-[21px] text-[#8a8a8a] underline"
            style={{ top: Y(765) }}
          >
            {joinMode === 'new' ? '초대 코드로 합류하기' : '새 기관 만들기로 돌아가기'}
          </button>
        ) : null}

        {/* 회원가입 필수 동의: 약관과 개인정보 동의를 분리해 각각 확인한다. */}
        <div
          data-fx="25:421"
          className="absolute left-[432px] h-[151px] w-[576px] rounded-[10px] border border-line bg-white"
          style={{ top: Y(916) }}
        />
        {[
          {
            fx: ['terms-check', 'terms-label'],
            checkTop: 922,
            textTop: 918,
            leading: 21,
            checked: termsAgreed,
            set: setTermsAgreed,
            label: '이용약관 동의(필수)',
            detail: '/terms',
            detailLabel: '약관 상세보기',
            detailTop: 918,
            body: <><span className="font-semibold text-ink-900">[필수]</span> 이용약관에 동의합니다.</>,
          },
          {
            fx: ['25:602', '25:422'],
            checkTop: 952,
            textTop: 948.76,
            leading: 21,
            checked: privacyAgreed,
            set: setPrivacyAgreed,
            label: '개인정보 수집·이용 동의(필수)',
            detail: '/consents/member-privacy',
            detailLabel: '수집·이용 상세보기',
            detailFx: '25:428',
            detailTop: 946.76,
            body: (
              <>
                <span className="font-semibold text-ink-900">[필수]</span> 개인정보 수집·이용에
                동의합니다.
              </>
            ),
          },
          ...(isSocialAccount ? [{
            fx: ['25:605', '25:468'],
            checkTop: 990,
            textTop: 984.79,
            leading: 25,
            checked: socialAgreed,
            set: setSocialAgreed,
            label: '소셜 계정 정보 제공 확인(필수)',
            detail: '/privacy',
            detailLabel: '처리방침 보기',
            detailTop: 984.79,
            body: (
              <>
                <span className="font-semibold text-ink-900">[필수]</span> 소셜
                계정(구글·카카오·네이버)에서 이메일·이름을 제공받는 것을
                <br />
                확인했습니다. 비밀번호는 저장되지 않습니다.
              </>
            ),
          }] : []),
        ].map((c) => (
          <div key={c.fx[0]}>
            <input
              id={`consent-${c.fx[0]}`}
              data-fx={c.fx[0]}
              type="checkbox"
              checked={c.checked}
              onChange={(e) => c.set(e.target.checked)}
              aria-label={c.label}
              className="absolute left-[458px] h-[17px] w-[17px] cursor-pointer accent-accent"
              style={{ top: Y(c.checkTop) }}
            />
            <label
              htmlFor={`consent-${c.fx[0]}`}
              data-fx={c.fx[1]}
              className="absolute left-[487px] cursor-pointer text-w-sub text-ink-500"
              style={{ top: Y(c.textTop), lineHeight: `${c.leading}px` }}
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
                top: Y(c.detailTop),
              }}
            >
              {c.detailLabel}
            </Link>
          </div>
        ))}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !isConfigured}
          data-fx="41:117"
          className="absolute left-[432px] h-[71px] w-[576px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          style={{ top: Y(1106) }}
        >
          {submitting ? '처리 중...' : '가입 완료'}
        </button>
      </main>
    </div>
  );
}
