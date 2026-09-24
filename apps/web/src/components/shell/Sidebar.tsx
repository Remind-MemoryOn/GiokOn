import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { asset, navIcon } from '../../assets/ui';
import type { NavItem } from './nav';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 118:300):
//   활성 pill 208×57 r10 배경 accent 20% @ left 44
//   아이콘 left 72~77 · 라벨 left 118 SemiBold 22/30 (아이콘 28 + 26 + 20)
//   항목 간격 79 (대시보드 186 → 어르신 관리 265 → … → 설정 739)
//   로그아웃 하단 고정(bottom 86)
//   ⚠️ 짧은 화면(≈768px)에서 로그아웃이 설정 항목을 덮던 원인은 하단 고정이 아니라
//      `<nav>` 이 flex 자식으로 **줄어들어**(기본 flex-shrink:1) 내용보다 낮아진 것이다.
//      → `shrink-0` 로 막는다. 여유가 없으면 사이드바가 자라고 페이지가 스크롤될 뿐이라
//      시안의 하단 고정 좌표(로그아웃 @924)는 그대로 남는다.
export function Sidebar({ items }: { items: NavItem[] }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    const pending = signOut();
    navigate('/', { replace: true });
    void pending.catch(() => {});
  }

  return (
    // ⚠️ `z-30` 은 장식이 아니라 **클릭을 살리는 장치**다. 화면 24종이 Figma 절대좌표를
    //    쓰려고 `-ml-[323px] w-[1440px]` 로 본문을 왼쪽으로 당겨 사이드바 위를 덮는다.
    //    그 띠(x 0~322)는 비어 있지만 DOM 순서상 나중이라 **클릭을 가로챘다** — 어느
    //    페이지에서도 사이드바를 누를 수 없었다(2026-09-11 사용자 신고).
    <aside className="relative z-30 flex w-[296px] shrink-0 flex-col pt-[50px]">
      <nav className="flex shrink-0 flex-col gap-[22px]">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="block">
            {({ isActive }) => (
              <span
                data-fx={isActive ? 'sidebar-active' : undefined}
                className={cn(
                  'relative ml-[44px] flex h-[57px] w-[208px] items-center rounded-[10px]',
                  isActive && 'bg-accent-soft',
                )}
              >
                <img
                  src={navIcon[item.icon][isActive ? 1 : 0]}
                  alt=""
                  width={26}
                  height={26}
                  className="ml-[28px] block h-[26px] w-[26px] object-contain"
                />
                <span
                  data-fx={`nav-${item.to}`}
                  className={cn(
                    'ml-[20px] text-w-nav font-semibold',
                    isActive ? 'text-accent' : 'text-ink-500',
                  )}
                >
                  {item.label}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mb-[86px] ml-[72px] mt-auto flex h-[57px] shrink-0 items-center gap-[14px] text-w-nav font-semibold text-ink-500 transition hover:text-accent"
      >
        <img src={asset.navLogout} alt="" width={28} height={28} className="block" />
        <span data-fx="sidebar-logout">로그아웃</span>
      </button>
    </aside>
  );
}
