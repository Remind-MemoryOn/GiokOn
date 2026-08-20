import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 118:300 대시보드 상단 · 15:443 공개 헤더):
//   바   h122 · 흰 배경 · shadow 1px 1px 10px rgba(108,101,101,.13)
//   워드마크 152×23 @ (63, 70)
//   검색 466×40 r100 배경 rgba(217,217,217,.3) @ (561, 62), 아이콘 21×22 @ (585,71)
//   벨   25×26 @ (1045, 69) + 카운트 배지 18 원 @ (1059, 60)
//   아바타 40 @ (1105, 62) · 이름 SemiBold 22 @ (1164, 67) · 펼침 화살표 @ (1359, 76)
interface Props {
  /** 어르신 검색 — 목록형 화면에서만 노출된다(디자인 기준). */
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** 미확인 알림 수. 0이면 배지를 숨긴다. */
  notificationCount?: number;
  /** 벨 드롭다운에 표시할 알림. */
  notifications?: { id: string; message: string }[];
}

export function TopBar({ search, notificationCount = 0, notifications = [] }: Props) {
  const { user, userRow } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const name = (userRow?.name ?? (user?.user_metadata?.name as string | undefined))?.trim();
  const roleLabel = userRow?.role === 'guardian' ? '보호자님' : '요양보호사님';
  const displayName = name ? `${name} ${roleLabel}` : (user?.email ?? roleLabel);

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      /* 로그아웃 실패해도 화면은 이동 */
    }
    navigate('/', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 h-[122px] shrink-0 bg-white shadow-topbar">
      <div className="relative mx-auto h-full w-full max-w-[1440px]">
        <Link to="/" className="absolute left-[63px] top-[70px]" aria-label="기억온 홈">
          <img src={asset.wordmark} alt="기억온" width={153} height={23} className="block" />
        </Link>

        {search ? (
          <div className="absolute left-[561px] top-[62px] flex h-[40px] w-[466px] items-center rounded-pill bg-mute-field">
            <img src={asset.iconSearch} alt="" width={21} height={22} className="ml-[24px]" />
            <input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? '이름을 검색하세요'}
              className="ml-3 h-full flex-1 bg-transparent pr-6 text-w-body text-ink-700 placeholder:text-ink-500 focus:outline-none"
            />
          </div>
        ) : null}

        {/* 알림 — 전용 화면은 디자인에 없다. 벨이 드롭다운을 연다. */}
        <div className="absolute left-[1045px] top-[69px]">
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            aria-expanded={bellOpen}
            aria-label={`알림${notificationCount > 0 ? ` ${notificationCount}건` : ''}`}
            className="relative block"
          >
            <img src={asset.iconBell} alt="" width={25} height={26} className="block" />
            {notificationCount > 0 ? (
              <span className="absolute -right-[11px] -top-[9px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[14px] font-semibold tracking-[-0.14px] text-white">
                {notificationCount}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div className="absolute right-0 top-[42px] w-[380px] rounded-[10px] bg-white p-6 shadow-card">
              {notifications.length === 0 ? (
                <p className="text-w-sub text-ink-500">새로운 알림이 없어요.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {notifications.map((n) => (
                    <li key={n.id} className="text-w-sub text-ink-700">
                      {n.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="absolute left-[1105px] top-[62px] flex items-center gap-[19px]">
          <img src={asset.avatarDefault} alt="" width={40} height={40} className="block rounded-full" />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="text-w-nav font-semibold text-ink-900"
          >
            <span className="whitespace-nowrap">{displayName}</span>
            {/* 펼침 화살표는 이름 길이와 무관하게 Figma 실측 위치(1359,76)에 고정된다 */}
            <img
              src={asset.iconChevronDown}
              alt=""
              width={18}
              height={12}
              className={cn(
                'absolute left-[254px] top-[14px] block transition',
                menuOpen && 'rotate-180',
              )}
            />
          </button>

          {/* 사용자 메뉴 드롭다운 — Figma components/Frame 1 (236×156) */}
          {menuOpen ? (
            <div className="absolute right-0 top-[68px] w-[236px] rounded-[10px] bg-white py-4 shadow-card">
              <Link
                to="/caregiver/settings"
                onClick={() => setMenuOpen(false)}
                className="flex h-[57px] items-center gap-4 px-[59px] text-w-nav font-semibold text-ink-500 hover:text-accent"
              >
                설정
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-[57px] w-full items-center gap-4 px-[59px] text-w-nav font-semibold text-ink-500 hover:text-accent"
              >
                로그아웃
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
