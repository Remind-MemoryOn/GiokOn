import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { asset } from '../../assets/ui';
import { Y } from '../../lib/figmaY';

// 아이디 찾기(111:148) · 비밀번호 찾기(111:170) · 비밀번호 재설정(114:247)은
// 골격이 완전히 같다(실측 확인): 돌아가기 @187 · 제목 @287 · 부제 @325 ·
// 입력 576×57 @431/560 · CTA 576×71 @672 · 하단 링크 @793.
//
// 회원가입(/signup)은 Figma 에 없다(시안의 "회원가입" 은 소셜 후 온보딩 전제).
// 입력이 3칸 필요해 **같은 리듬을 한 칸 더 이어서** 쓴다 — 필드 pitch 129(431→560),
// CTA 는 마지막 입력 +112(560→672), 하단 링크는 CTA +121(672→793). 새 치수를 만들지 않는다.
//
// ⚠️ 라인 높이 — Figma 는 제목만 30 을 지정하고 나머지는 auto(≈1.2)다.
//    토큰(text-w-sub=18/28 등)을 그대로 쓰면 라인박스가 커져 잉크가 3px 내려간다.
//    실측 라인박스(24·21)를 명시해 잉크 위치를 맞춘다.
export interface AuthField {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}

interface Props {
  title: string;
  subtitle: string;
  /** 2칸(Figma 실측 화면) 또는 3칸(회원가입 — 같은 리듬을 한 칸 연장). */
  fields: [AuthField, AuthField] | [AuthField, AuthField, AuthField];
  submitLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  /** 하단 보조 링크(있는 화면만). top 은 Figma 실측(111:148=793 · 111:170=796.8). */
  footerLink?: { to: string; label: string; top?: number };
  /** 결과 안내 등 화면별 추가 요소. */
  children?: ReactNode;
}

const PITCH = 129; // 431 → 560 실측
const FIELD_TOP = (i: number) => 395 + i * PITCH;
const INPUT_TOP = (i: number) => 431 + i * PITCH;
/** 마지막 입력 아래 112(560→672). 하단 링크는 CTA 아래 121(672→793). */
const ctaTop = (n: number) => INPUT_TOP(n - 1) + 112;

export function AuthFormScreen({
  title,
  subtitle,
  fields,
  submitLabel,
  onSubmit,
  submitting,
  disabled,
  footerLink,
  children,
}: Props) {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main
        className="relative mx-auto w-full max-w-[1440px]"
        style={{ height: fields.length === 3 ? 903 + PITCH : 903 }}
      >
        <Link
          to="/login"
          data-fx="114:228"
          className="absolute left-[163px] flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
          style={{ top: Y(187) }}
        >
          <img
            src={asset.iconChevronRightSm}
            alt=""
            width={12}
            height={19}
            className="block rotate-180"
          />
          <span data-fx="114:229">돌아가기</span>
        </Link>

        <h1
          data-fx="111:119"
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-w-section font-semibold leading-[30px] text-ink-900"
          style={{ top: Y(287) }}
        >
          {title}
        </h1>
        <p
          data-fx="111:118"
          className="absolute left-1/2 w-[470px] -translate-x-1/2 text-center text-w-sub leading-[21px] text-ink-500"
          style={{ top: Y(325) }}
        >
          {subtitle}
        </p>

        {fields.map((f, i) => (
          <div key={f.label}>
            {/* 별표는 라벨 글자 폭을 따라 흐른다 — 좌표를 박으면 라벨이 다른 화면(회원가입)에서
                어긋난다. Figma 실측과 동일하게 떨어진다: 라벨 '이름' 432+35 → 별표 467,
                별표 라인박스(30)는 라벨(24)보다 9px 위. */}
            <div
              className="absolute left-[432px] flex items-start"
              style={{ top: Y(FIELD_TOP(i)) }}
            >
              <label
                data-fx={i === 0 ? '111:121' : i === 1 ? '111:126' : 'auth-field-2-label'}
                className="text-[20px] font-medium leading-[24px] text-ink-900"
                htmlFor={`auth-field-${i}`}
              >
                {f.label}
              </label>
              <span
                data-fx={i === 0 ? '111:125' : i === 1 ? '111:129' : 'auth-field-2-star'}
                className="relative top-[-9px] text-[12px] font-medium leading-[30px] text-accent"
                aria-hidden
              >
                ✱
              </span>
            </div>
            <input
              data-fx={i === 0 ? '111:122' : i === 1 ? '111:127' : 'auth-field-2-input'}
              id={`auth-field-${i}`}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              placeholder={f.placeholder}
              className="absolute left-[431px] h-[57px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
              style={{ top: Y(INPUT_TOP(i)) }}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || disabled}
          data-fx="111:139"
          className="absolute left-[431px] h-[71px] w-[576px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          style={{ top: Y(ctaTop(fields.length)) }}
        >
          {submitting ? '처리 중...' : submitLabel}
        </button>

        {footerLink ? (
          <Link
            to={footerLink.to}
            data-fx="111:145"
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[20px] font-medium leading-[24px] text-ink-500"
            style={{ top: Y(footerLink.top ?? ctaTop(fields.length) + 121) }}
          >
            {footerLink.label}
          </Link>
        ) : null}

        {children}
      </main>
    </div>
  );
}
