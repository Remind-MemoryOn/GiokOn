import { Link, useLocation } from 'react-router-dom';
import { asset } from '../../assets/ui';
import { cn } from '../../lib/utils';

// 공개 화면 공통 헤더 — Figma 15:443 실측.
//   바 h122 흰 배경 shadow-topbar · 워드마크 153×23 @ (130, 71)
//   내비 SemiBold 22/30 @ top 68 — 서비스 소개 720 · 이용안내 898 · 문의 1052 · 로그인/회원가입 1168
//   활성 항목은 accent 글자 + 아래 3px 밑줄
const NAV = [
  { to: '/', label: '서비스 소개', left: 720 },
  { to: '/guide', label: '이용안내', left: 898 },
  // 라벨·좌표는 Figma 실측 고정. 목적지만 문의사항 게시판으로 바뀌었다(2026-09-02).
  { to: '/inquiries', label: '문의', left: 1052 },
  { to: '/login', label: '로그인/회원가입', left: 1168 },
];

export function PublicHeader() {
  const { pathname } = useLocation();
  const activeIndex = NAV.findIndex((n) =>
    n.to === '/' ? pathname === '/' : pathname.startsWith(n.to.split('#')[0]),
  );

  return (
    <header className="h-[122px] w-full bg-white shadow-topbar">
      <div className="relative mx-auto h-full w-full max-w-[1440px]">
        <Link to="/" className="absolute left-[130px] top-[71px]" aria-label="기억온 홈">
          <img
            src={asset.wordmark}
            alt="기억온"
            width={153}
            height={23}
            className="block"
            data-fx="ph-wordmark"
          />
        </Link>
        <nav>
          {NAV.map((n, i) => {
            const active = i === activeIndex;
            return (
              <Link
                key={n.label}
                to={n.to}
                data-fx={`ph-nav-${i}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'absolute top-[68px] whitespace-nowrap text-w-nav font-semibold',
                  active ? 'text-accent' : 'text-ink-500 hover:text-ink-700',
                )}
                style={{ left: n.left }}
              >
                {n.label}
                {active ? (
                  <span className="absolute -bottom-[19px] left-0 h-[3px] w-full bg-accent" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
