import { useCallback, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useGiokonRealtime, type RealtimeEvent } from '@giokon/data';
import { TopBar } from './shell/TopBar';
import { Sidebar } from './shell/Sidebar';
import { CAREGIVER_NAV, GUARDIAN_NAV, type NavItem } from './shell/nav';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';

// 신규 디자인의 공용 셸: 상단 바(122) + 좌측 사이드바(296) + 콘텐츠 열(1054 @ x323).
// 요양보호사·보호자 모두 같은 셸을 쓰고 사이드바 항목만 다르다.
function AppShell({ nav }: { nav: NavItem[] }) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const [search, setSearch] = useState('');

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

  return (
    <div className="min-h-screen bg-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[10px] focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        본문으로 바로가기
      </a>
      <TopBar search={{ value: search, onChange: setSearch }} />
      <div className="mx-auto flex w-full max-w-[1440px]">
        <Sidebar items={nav} />
        <main id="main-content" className="min-w-0 flex-1 pb-24 pl-[27px] pr-[63px]">
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
  return <AppShell nav={GUARDIAN_NAV} />;
}

/** 화면 제목 — Bold 30 accent @ (322,169) + 설명 Regular 20/30 #404040 @ 236. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-8 pb-8 pt-[47px]">
      <div>
        <h1 className="text-w-page font-bold leading-[70px] text-accent">{title}</h1>
        {description ? (
          <div className="max-w-[640px] text-w-body leading-[30px] text-ink-700">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3 pt-6">{actions}</div> : null}
    </header>
  );
}
