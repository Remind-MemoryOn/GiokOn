import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Brain, Home, Users, FileText, LogOut, Heart } from 'lucide-react';
import { signOut } from '@giokon/data';
import { cn } from '../lib/utils';
import { useAuth } from '../auth/AuthProvider';

const NAV = [
  { to: '/caregiver',        label: '대시보드',    icon: Home, end: true },
  { to: '/caregiver/elders', label: '어르신 관리', icon: Users },
  { to: '/caregiver/logs',   label: '세션 기록',   icon: FileText },
];

export function CaregiverLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const name = (user?.user_metadata?.name as string | undefined)?.trim();
  const displayName = name || user?.email || '요양보호사';
  const avatarText = name ? name.slice(-2) : displayName.slice(0, 2).toUpperCase();

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      /* 로그아웃 실패해도 화면은 이동 */
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-full flex">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-warm-500 flex items-center justify-center shadow-warm">
              <Brain size={20} className="text-white" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">기억온</div>
              <div className="text-[11px] text-slate-500">요양보호사 화면</div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-bold">
              {avatarText}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              <div className="text-[11px] text-slate-500">요양보호사</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                  isActive
                    ? 'bg-warm-50 text-warm-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )
              }
            >
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100 space-y-2">
          <button
            onClick={() => navigate('/elder')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-warm-700 bg-warm-50 hover:bg-warm-100 transition"
          >
            <Heart size={16} /> 어르신 화면 미리보기
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <LogOut size={16} /> 로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
