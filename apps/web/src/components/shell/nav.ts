import type { NavIconKey } from '../../assets/ui';

// 사이드바 항목 — 신규 디자인 실측 순서(Figma 118:300 / 보호자 50:543).
export interface NavItem {
  to: string;
  label: string;
  icon: NavIconKey;
  end?: boolean;
}

export const CAREGIVER_NAV: NavItem[] = [
  { to: '/caregiver', label: '대시보드', icon: 'dashboard', end: true },
  { to: '/caregiver/elders', label: '어르신 관리', icon: 'elders' },
  { to: '/caregiver/sessions', label: '세션 기록', icon: 'sessions' },
  { to: '/caregiver/analysis', label: '분석', icon: 'analysis' },
  { to: '/caregiver/journal', label: '프로그램 일지', icon: 'journal' },
  { to: '/caregiver/shares', label: '공개 관리', icon: 'shares' },
  { to: '/caregiver/org', label: '기관 관리', icon: 'org' },
  { to: '/caregiver/settings', label: '설정', icon: 'settings' },
  // 파일럿 W2 감독 화면 — 시안에 없는 메뉴라 **맨 끝**에 둔다(중간에 끼우면 시안 실측 항목 좌표가 79px 씩 밀린다).
  { to: '/caregiver/supervision', label: '감독', icon: 'supervision' },
];

export const GUARDIAN_NAV: NavItem[] = [
  { to: '/guardian', label: '어르신 연결', icon: 'elders', end: true },
  { to: '/guardian/feed', label: '공개된 소식', icon: 'shares' },
  { to: '/guardian/analysis', label: '분석', icon: 'analysis' },
  { to: '/guardian/settings', label: '설정', icon: 'settings' },
];
