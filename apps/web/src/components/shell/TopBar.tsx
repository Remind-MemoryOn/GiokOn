import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dateDotTime } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 118:300 대시보드 상단 · 15:443 공개 헤더):
//   바   h122 · 흰 배경 · shadow 1px 1px 10px rgba(108,101,101,.13)
//   워드마크 152×23 @ (63, 70)
//   검색 466×40 r100 배경 rgba(217,217,217,.3) @ (561, 62), 아이콘 21×22 @ (585,71)
//   벨   23×25 @ (1045, 69) + 카운트 배지 18 원 @ (1059, 60)
//   아바타 40 @ (1105, 62) · 이름 SemiBold 22 @ (1164, 67) · 펼침 화살표 @ (1359, 76)
// ⚠️ 보호자 셸(31:616 등)은 **검색이 없고** 오른쪽 묶음이 밀린다:
//   벨 @1080 · 아바타 @1140 · 이름 @1199. 화살표는 같은 1359.
interface Props {
  /** 보호자 셸은 검색이 없고 오른쪽 묶음 x 가 다르다(Figma 31:616). */
  variant?: 'caregiver' | 'guardian';
  /** 어르신 검색 — 목록형 화면에서만 노출된다(디자인 기준). */
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** 검색어와 일치하는 어르신 — 현재 업무 화면 안에서 바로 이동한다. */
  searchResults?: { id: string; label: string; to: string }[];
  /** 미확인 알림 수. 0이면 배지를 숨긴다. */
  notificationCount?: number;
  /** 벨 드롭다운에 표시할 알림(최신순). */
  notifications?: NotificationItem[];
  /** 알림 하나를 읽음 처리. */
  onReadNotification?: (id: string) => void;
  /** 드롭다운의 "모두 읽음". */
  onReadAllNotifications?: () => void;
}

/** 벨 드롭다운 항목 — 전용 알림 화면은 디자인에 없어 여기까지가 알림의 소비처다. */
export interface NotificationItem {
  id: string;
  title: string;
  body?: string | null;
  /** 발생 시각(ISO). 없으면 시각을 표시하지 않는다. */
  at?: string | null;
  read?: boolean;
}

export function TopBar({
  variant = 'caregiver',
  search,
  searchResults = [],
  notificationCount = 0,
  notifications = [],
  onReadNotification,
  onReadAllNotifications,
}: Props) {
  const guardian = variant === 'guardian';
  const X = guardian ? { bell: 1080, avatar: 1140, chevron: 219 } : { bell: 1045, avatar: 1105, chevron: 254 };
  const { user, userRow, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const name = (userRow?.name ?? (user?.user_metadata?.name as string | undefined))?.trim();
  const roleLabel = userRow?.role === 'guardian' ? '보호자님' : '요양보호사님';
  const displayName = name ? `${name} ${roleLabel}` : (user?.email ?? roleLabel);

  function handleLogout() {
    const pending = signOut();
    navigate('/', { replace: true });
    void pending.catch(() => {});
  }

  return (
    <header className="sticky top-0 z-40 h-[122px] shrink-0 bg-white shadow-topbar">
      <div className="relative mx-auto h-full w-full max-w-[1440px]">
        <Link to="/" className="absolute left-[63px] top-[70px]" aria-label="기억온 홈">
          <img
            src={asset.wordmark}
            alt="기억온"
            width={153}
            height={23}
            className="block"
            data-fx="topbar-wordmark"
          />
        </Link>

        {search ? (
          <div className="absolute left-[561px] top-[62px] h-[40px] w-[466px]">
            <div
              className="flex h-[40px] w-full items-center rounded-pill bg-mute-field"
              data-fx="topbar-search"
            >
              <img
                src={asset.iconSearch}
                alt=""
                width={21}
                height={22}
                className="ml-[24px]"
                data-fx="topbar-search-icon"
              />
              <input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                /* Figma 탑바 검색은 안내문 없이 돋보기만 둔다 — 보이는 라벨이 없으므로
                   스크린리더용 이름을 붙인다(렌더에는 영향이 없다, KWCAG 라벨 제공). */
                aria-label="어르신 검색"
                placeholder={search.placeholder ?? ''}
                className="ml-3 h-full flex-1 bg-transparent pr-6 text-w-body text-ink-700 placeholder:text-ink-500 focus:outline-none"
              />
            </div>
            {/* 결과 목록은 시안에 없다 — 검색창이 표시만 되고 아무 데도 못 가던 것을 잇는다.
                박스는 40px 그대로고 목록은 그 아래에 겹쳐 뜬다(레이아웃 불변). */}
            {search.value.trim() ? (
              <div
                role="listbox"
                aria-label="어르신 검색 결과"
                className="absolute inset-x-0 top-[48px] z-10 overflow-hidden rounded-[10px] border border-line bg-white shadow-card"
              >
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <Link
                      key={result.id}
                      to={result.to}
                      role="option"
                      aria-selected={false}
                      onClick={() => search.onChange('')}
                      className="flex min-h-[48px] items-center px-5 text-w-sub text-ink-700 hover:bg-accent-soft hover:text-accent focus:bg-accent-soft focus:outline-none"
                    >
                      {result.label}
                    </Link>
                  ))
                ) : (
                  <p className="px-5 py-3 text-w-sub text-ink-500">일치하는 어르신이 없어요.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 알림 — 전용 화면은 디자인에 없다. 벨이 드롭다운을 연다. */}
        <div className="absolute top-[69px]" style={{ left: X.bell }}>
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            aria-expanded={bellOpen}
            aria-label={`알림${notificationCount > 0 ? ` ${notificationCount}건` : ''}`}
            className="relative block"
          >
            <img src={asset.iconBell} alt="" width={23} height={25} className="block" data-fx="topbar-bell" />
            {notificationCount > 0 ? (
              <span
                className="absolute -right-[9px] -top-[9px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[14px] font-semibold tracking-[-0.14px] text-white"
                data-fx="topbar-badge"
              >
                {notificationCount}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div
              className="absolute right-0 top-[42px] max-h-[420px] w-[380px] overflow-y-auto rounded-[10px] bg-white p-6 shadow-card"
              role="region"
              aria-label="알림"
            >
              {notifications.length === 0 ? (
                <p className="text-w-sub text-ink-500">새로운 알림이 없어요.</p>
              ) : (
                <>
                  {notificationCount > 0 && onReadAllNotifications ? (
                    <div className="mb-4 flex justify-end">
                      <button
                        type="button"
                        onClick={onReadAllNotifications}
                        className="text-w-label leading-[24px] text-ink-500 underline hover:text-accent"
                      >
                        모두 읽음
                      </button>
                    </div>
                  ) : null}
                  <ul className="flex flex-col gap-4">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => !n.read && onReadNotification?.(n.id)}
                          className="flex w-full gap-2 text-left"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'mt-[9px] h-[6px] w-[6px] shrink-0 rounded-full',
                              n.read ? 'bg-transparent' : 'bg-accent',
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block text-w-sub',
                                n.read ? 'text-ink-500' : 'font-semibold text-ink-900',
                              )}
                              style={{ wordBreak: 'keep-all' }}
                            >
                              {n.title}
                            </span>
                            {n.body ? (
                              <span
                                className="mt-1 block text-w-label leading-[24px] text-ink-700"
                                style={{ wordBreak: 'keep-all' }}
                              >
                                {n.body}
                              </span>
                            ) : null}
                            {n.at ? (
                              <span className="mt-1 block text-w-label leading-[24px] text-ink-500">
                                {dateDotTime(n.at)}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="absolute top-[62px] flex items-center gap-[19px]" style={{ left: X.avatar }}>
          <img
            src={asset.avatarDefault}
            alt=""
            width={40}
            height={40}
            className="block rounded-full"
            data-fx="topbar-avatar"
          />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="text-w-nav font-semibold text-ink-900"
          >
            <span className="whitespace-nowrap" data-fx="topbar-name">
              {displayName}
            </span>
            {/* 펼침 화살표는 이름 길이와 무관하게 Figma 실측 위치(1359,76)에 고정된다 */}
            <img
              src={asset.iconChevronDown}
              alt=""
              width={18}
              height={12}
              style={{ left: X.chevron }}
              className={cn('absolute top-[14px] block transition', menuOpen && 'rotate-180')}
            />
          </button>

          {/* 사용자 메뉴 드롭다운 — Figma components/Frame 1 (236×156) */}
          {menuOpen ? (
            <div className="absolute right-0 top-[68px] w-[236px] rounded-[10px] bg-white py-4 shadow-card">
              <Link
                to={guardian ? '/guardian/settings' : '/caregiver/settings'}
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
