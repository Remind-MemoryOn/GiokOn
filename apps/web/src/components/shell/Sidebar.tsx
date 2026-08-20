import { NavLink } from 'react-router-dom';
import { signOut } from '@giokon/data';
import { useNavigate } from 'react-router-dom';
import { asset, navIcon } from '../../assets/ui';
import type { NavItem } from './nav';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 118:300):
//   활성 pill 208×57 r10 배경 accent 20% @ left 44
//   아이콘 left 72~77 · 라벨 left 118 SemiBold 22/30
//   항목 간격 79 (대시보드 186 → 어르신 관리 265 → … → 설정 739)
//   로그아웃 하단 고정(bottom 84)
export function Sidebar({ items }: { items: NavItem[] }) {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      /* 로그아웃 실패해도 화면은 이동 */
    }
    navigate('/', { replace: true });
  }

  return (
    <aside className="flex w-[296px] shrink-0 flex-col pt-[50px]">
      <nav className="flex flex-col gap-[22px]">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="block">
            {({ isActive }) => (
              <span
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
                  className={cn(
                    'ml-[18px] text-w-nav font-semibold',
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
        className="mb-[84px] ml-[72px] mt-auto flex items-center gap-[14px] text-w-nav font-semibold text-ink-500 transition hover:text-accent"
      >
        <img src={asset.navLogout} alt="" width={28} height={28} className="block" />
        로그아웃
      </button>
    </aside>
  );
}
