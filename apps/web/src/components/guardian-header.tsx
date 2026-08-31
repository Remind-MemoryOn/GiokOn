// 보호자 화면 머리 — 인사말·부제·연결된 어르신 pill (Figma 50:543 · 96:94 공통 실측).
//   인사말 Bold 30/40 @(322,186) — 이름만 주황 · 부제 20/30 @(322,236.14)
//   pill 322×57 @(1054,187) — 라벨 SemiBold 18(주황 @34 · 검정 @161) · ∨ 15.37×10 @276
import { Link } from 'react-router-dom';
import { asset } from '../assets/ui';
import { Y } from '../lib/analysis';

export function GuardianGreeting({
  name, subtitle, fxTitle, fxDesc, top = 186, descTop = 236.14,
}: {
  name: string | null | undefined;
  subtitle: string;
  fxTitle: string;
  fxDesc: string;
  top?: number;
  descTop?: number;
}) {
  return (
    <>
      <h1
        data-fx={fxTitle}
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(top) }}
      >
        {/* 이름은 로그인 계정에서 온다 */}
        안녕하세요, <span className="text-accent">{name ?? '보호자'}</span> 보호자님!
      </h1>
      <p
        data-fx={fxDesc}
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(descTop) }}
      >
        {subtitle}
      </p>
    </>
  );
}

export function ElderPill({
  elderName, to, fxBox, fxLabel, fxName, top = 187,
}: {
  elderName: string | null | undefined;
  to: string;
  fxBox: string;
  fxLabel: string;
  fxName: string;
  top?: number;
}) {
  return (
    <Link
      to={to}
      data-fx={fxBox}
      className="absolute flex h-[57px] w-[322px] items-center rounded-[10px] border border-accent bg-white"
      style={{ left: 1054, top: Y(top) }}
    >
      <span
        data-fx={fxLabel}
        className="absolute left-[34px] whitespace-nowrap text-[18px] font-semibold leading-[30px] text-accent"
      >
        연결된 어르신
      </span>
      <span
        data-fx={fxName}
        className="absolute left-[161px] whitespace-nowrap text-[18px] font-semibold leading-[30px] text-ink-900"
      >
        {elderName ? `${elderName} 어르신` : '—'}
      </span>
      <img
        src={asset.iconChevronDownSm}
        alt=""
        className="absolute left-[276px] block"
        style={{ width: 15.37, height: 10 }}
      />
    </Link>
  );
}
