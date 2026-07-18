import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Brain, Home, Users, FileText, LogOut, Building2, Settings } from 'lucide-react';
import { signOut, useGiokonRealtime } from '@giokon/data';
import { cn } from '../lib/utils';
import { useAuth } from '../auth/AuthProvider';

const NAV = [
  { to: '/caregiver',          label: '대시보드',    icon: Home, end: true },
  { to: '/caregiver/elders',   label: '어르신 관리', icon: Users },
  { to: '/caregiver/logs',     label: '세션 기록',   icon: FileText },
  { to: '/caregiver/org',      label: '기관 관리',   icon: Building2 },
  { to: '/caregiver/settings', label: '설정',        icon: Settings },
];

export function CaregiverLayout() {
  const { user, userRow, isConfigured } = useAuth();
  const navigate = useNavigate();

  // 앱 대화 종료 → sessions/분석/공개 변경을 실시간 반영(T-E3, 폴링 대체).
  useGiokonRealtime({ enabled: isConfigured });

  const name = (userRow?.name ?? (user?.user_metadata?.name as string | undefined))?.trim();
  const displayName = name || user?.email || '요양보호사';
  const avatarText = name ? name.slice(-2) : displayName.slice(0, 2).toUpperCase();
  const roleLabel = userRow?.role === 'org_admin' ? '기관 관리자' : '요양보호사';

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
      {/* 접근성: 키보드 사용자를 위한 본문 바로가기 (KWCAG) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-warm-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        본문으로 바로가기
      </a>
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
              <div className="text-[11px] text-slate-500">{roleLabel}</div>
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
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <LogOut size={16} /> 로그아웃
          </button>
          <div className="px-3 pt-1 text-[10px] text-slate-400 space-x-2">
            <Link to="/privacy" className="hover:text-slate-600">처리방침</Link>
            <Link to="/terms" className="hover:text-slate-600">약관</Link>
          </div>
        </div>
      </aside>
      <main id="main-content" className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
