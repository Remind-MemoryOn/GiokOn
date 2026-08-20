import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { asset } from '../../assets/ui';

// 아이디 찾기(111:148) · 비밀번호 찾기(111:170) · 비밀번호 재설정(114:247)은
// 골격이 완전히 같다(실측 확인): 돌아가기 @187 · 제목 @287 · 부제 @325 ·
// 입력 576×57 @431/560 · CTA 576×71 @672 · 하단 링크 @793.
const Y = (v: number) => v - 122;

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
  fields: [AuthField, AuthField];
  submitLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  /** 하단 보조 링크(있는 화면만). */
  footerLink?: { to: string; label: string };
  /** 결과 안내 등 화면별 추가 요소. */
  children?: ReactNode;
}

const FIELD_TOP = [395, 524];
const INPUT_TOP = [431, 560];

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
      <main className="relative mx-auto h-[903px] w-full max-w-[1440px]">
        <Link
          to="/login"
          className="absolute left-[163px] flex items-center gap-[9px] text-[20px] font-semibold text-ink-700"
          style={{ top: Y(187) }}
        >
          <img
            src={asset.iconChevronRight}
            alt=""
            width={12}
            height={19}
            className="block rotate-180"
          />
          돌아가기
        </Link>

        <h1
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-w-section font-semibold leading-[30px] text-ink-900"
          style={{ top: Y(287) }}
        >
          {title}
        </h1>
        <p
          className="absolute left-1/2 w-[470px] -translate-x-1/2 text-center text-w-sub text-ink-500"
          style={{ top: Y(325) }}
        >
          {subtitle}
        </p>

        {fields.map((f, i) => (
          <div key={f.label}>
            <label
              className="absolute left-[432px] text-[20px] font-medium leading-[30px] text-ink-900"
              style={{ top: Y(FIELD_TOP[i]) }}
              htmlFor={`auth-field-${i}`}
            >
              {f.label}
              <span className="align-top text-[12px] text-accent" aria-hidden>
                ✱
              </span>
            </label>
            <input
              id={`auth-field-${i}`}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              placeholder={f.placeholder}
              className="absolute left-[431px] h-[57px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
              style={{ top: Y(INPUT_TOP[i]) }}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || disabled}
          className="absolute left-[431px] h-[71px] w-[576px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          style={{ top: Y(672) }}
        >
          {submitting ? '처리 중...' : submitLabel}
        </button>

        {footerLink ? (
          <Link
            to={footerLink.to}
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[20px] font-medium text-ink-500"
            style={{ top: Y(793) }}
          >
            {footerLink.label}
          </Link>
        ) : null}

        {children}
      </main>
    </div>
  );
}
