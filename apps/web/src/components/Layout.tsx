import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import {
  toElderProfile,
  useGiokonRealtime,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyMessages,
  useMyNotifications,
  useProfiles,
  unreadCount,
  type RealtimeEvent,
} from '@giokon/data';
import { TopBar } from './shell/TopBar';
import { Sidebar } from './shell/Sidebar';
import { CAREGIVER_NAV, GUARDIAN_NAV, type NavItem } from './shell/nav';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { cn } from '../lib/utils';

// 신규 디자인의 공용 셸: 상단 바(122) + 좌측 사이드바(296) + 콘텐츠 열(1054 @ x323).
// 요양보호사·보호자 모두 같은 셸을 쓰고 사이드바 항목만 다르다.
function AppShell({ nav, variant = 'caregiver' }: { nav: NavItem[]; variant?: 'caregiver' | 'guardian' }) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const location = useLocation();
  const [search, setSearch] = useState('');
  const hideSearch = variant === 'guardian' && location.pathname === '/guardian';

  // 검색 결과 — 시안에는 입력창만 있고 결과가 없어 아무 데도 갈 수 없었다.
  // 지금 보고 있는 업무 섹션(어르신·세션·분석·일지·공개) 안에서 그 어르신으로 옮겨 준다.
  const isCaregiver = location.pathname.startsWith('/caregiver');
  const profiles = useProfiles({ enabled: isConfigured && isCaregiver });
  const section = location.pathname.split('/')[2] || 'elders';
  const sectionRoot = ['elders', 'sessions', 'analysis', 'journal', 'shares'].includes(section)
    ? section
    : 'elders';
  const term = search.trim();
  const searchResults = useMemo(() => {
    if (!isCaregiver || !term) return [];
    return (profiles.data ?? [])
      .map(toElderProfile)
      .filter((elder) => elder.name.includes(term))
      .slice(0, 6)
      .map((elder) => ({
        id: elder.id,
        label: `${elder.name} 어르신`,
        to: `/caregiver/${sectionRoot}/${elder.id}`,
      }));
  }, [isCaregiver, term, profiles.data, sectionRoot]);

  // 앱 대화 종료 → 세션·분석·공개 변경을 실시간 반영.
  const onRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.table === 'session_analyses' && event.eventType === 'INSERT') {
        toast('info', '새 세션 분석이 도착했어요 — 분석에서 확인하세요.');
      }
    },
    [toast],
  );
  useGiokonRealtime({ enabled: isConfigured, onEvent: onRealtimeEvent });

  // 탑바 벨 — 알림은 DB 트리거가 파생한다(안전 이벤트·보호자 확인). 근거 없는
  // 숫자를 만들지 않으므로 알림이 없으면 배지도 없다.
  const { data: notificationRows } = useMyNotifications({ enabled: isConfigured });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  // 메시지 알림 본문은 미리보기(200자)라 원문을 곁들인다 — 요양보호사 수신함 화면이
  // 디자인에 없어 벨이 유일한 수신처다. RLS 가 담당 어르신 것만 돌려준다.
  // 메시지 알림이 하나도 없으면 원문을 받을 이유가 없다.
  const hasMessageNotice = (notificationRows ?? []).some((n) => n.kind === 'message');
  const { data: messageRows } = useMyMessages({ enabled: isConfigured && hasMessageNotice });
  const notifications = useMemo(() => {
    const bodyById = new Map((messageRows ?? []).map((m) => [m.id, m.body]));
    return (notificationRows ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      body: (n.kind === 'message' && n.source_id ? bodyById.get(n.source_id) : null) ?? n.body,
      at: n.created_at,
      read: n.read_at !== null,
    }));
  }, [notificationRows, messageRows]);
  const handleReadNotification = useCallback(
    (id: string) => markRead.mutate(id),
    [markRead],
  );
  const handleReadAllNotifications = useCallback(() => markAllRead.mutate(), [markAllRead]);

  return (
    <div className="min-h-screen bg-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[10px] focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        본문으로 바로가기
      </a>
      {/* 보호자 '어르신 연결' 화면만 검색이 없다(Figma 31:616) — 목록 화면은 있다(50:543) */}
      <TopBar
        variant={variant}
        search={
          hideSearch
            ? undefined
            : { value: search, onChange: setSearch, placeholder: isCaregiver ? '어르신 검색' : '' }
        }
        searchResults={searchResults}
        notificationCount={unreadCount(notificationRows)}
        notifications={notifications}
        onReadNotification={handleReadNotification}
        onReadAllNotifications={handleReadAllNotifications}
      />
      <div className="mx-auto flex w-full max-w-[1440px] min-h-[calc(100vh-122px)]">
        <Sidebar items={nav} />
        <main
          id="main-content"
          className="flex min-w-0 flex-1 flex-col pb-[88px] pl-[27px] pr-[63px]"
        >
          <Outlet context={{ search }} />
        </main>
      </div>
    </div>
  );
}

export function CaregiverLayout() {
  return <AppShell nav={CAREGIVER_NAV} />;
}

export function GuardianLayout() {
  return <AppShell nav={GUARDIAN_NAV} variant="guardian" />;
}

/** 화면 제목 — Bold 30/70 @ (322,169) + 설명 Regular 20/30 @ 236.2(제목 라인박스와 3px 겹침)
 *  액션 버튼은 @188 · 버튼 간격 24 (Figma 161:207 실측).

 *  제목 색은 화면마다 다르다(대시보드=accent, 어르신 관리=black) → Figma 실측대로 지정. */
export function PageHeader({
  title,
  description,
  actions,
  tone = 'ink',
  descMax = 640,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: 'accent' | 'ink';
  /** 설명 줄바꿈 폭(px) — Figma 가 한 줄로 그린 화면은 실측 폭을 준다(기본 640). */
  descMax?: number;
}) {
  return (
    <header className="flex items-start justify-between gap-8 pt-[47px]">
      <div>
        <h1
          data-fx="page-title"
          className={cn(
            'text-w-page font-bold leading-[70px]',
            tone === 'accent' ? 'text-accent' : 'text-ink-900',
          )}
        >
          {title}
        </h1>
        {description ? (
          <div
            data-fx="page-desc"
            className="-mt-[3px] text-w-body leading-[30px] text-ink-700"
            style={{ maxWidth: descMax }}
          >
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div data-fx="page-actions" className="flex shrink-0 items-center gap-[24px] pt-[19px]">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
