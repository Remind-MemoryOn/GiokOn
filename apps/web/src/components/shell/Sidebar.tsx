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
//   메뉴 항목이 늘어도 로그아웃은 화면 안에 남고 메뉴 영역만 독립적으로 스크롤한다.
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
    <aside className="sticky top-[122px] z-30 flex h-[calc(100vh-122px)] min-h-[360px] w-[296px] shrink-0 flex-col pt-[50px]">
      <nav aria-label="주 메뉴" className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto pb-4">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} aria-label={item.label} className="block">
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
                    item.label === '대화관찰리포트' && 'leading-[25px]',
                    isActive ? 'text-accent' : 'text-ink-500',
                  )}
                >
                  {item.label === '대화관찰리포트' ? <>대화관찰<br />리포트</> : item.label}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="mb-4 ml-[72px] flex h-[57px] shrink-0 items-center gap-[14px] text-w-nav font-semibold text-ink-500 transition hover:text-accent min-[1100px]:mb-[86px]"
      >
        <img src={asset.navLogout} alt="" width={28} height={28} className="block" />
        <span data-fx="sidebar-logout">로그아웃</span>
      </button>
    </aside>
  );
}
