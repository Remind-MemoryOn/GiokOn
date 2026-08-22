// 신규 웹 디자인 공용 에셋 — Figma export(@4x)에서 실측 좌표로 크롭한 것들.
// 생성 스크립트: scripts/crop-web-figma-assets.py (크롭 표가 곧 실측 근거)
// ⚠️ 아이콘을 코드로 다시 그리지 않는다. 새 아이콘이 필요하면 크롭 표에 추가한다.

import wordmark from './wordmark.png';
import iconSearch from './icon-search.png';
import iconSearchField from './icon-search-field.png';
import iconPencilLg from './icon-pencil-lg.png';
import iconTrashLg from './icon-trash-lg.png';
import iconCalendarSm from './icon-calendar-sm.png';
import iconChevronDownSm from './icon-chevron-down-sm.png';
import iconChevronDownMd from './icon-chevron-down-md.png';
import iconCloseSm from './icon-close-sm.png';
import iconPhotoUpload from './icon-photo-upload.png';
import iconClockSm from './icon-clock-sm.png';
import iconChevronRightSm from './icon-chevron-right-sm.png';
import avatarAi from './avatar-ai.png';
import iconBell from './icon-bell.png';
import iconChevronDown from './icon-chevron-down.png';
import iconChevronRight from './icon-chevron-right.png';
import avatarDefault from './avatar-default.png';
import navDashboard from './nav-dashboard.png';
import navDashboardOn from './nav-dashboard-on.png';
import navElders from './nav-elders.png';
import navEldersOn from './nav-elders-on.png';
import navSessions from './nav-sessions.png';
import navSessionsOn from './nav-sessions-on.png';
import navAnalysis from './nav-analysis.png';
import navAnalysisOn from './nav-analysis-on.png';
import navJournal from './nav-journal.png';
import navJournalOn from './nav-journal-on.png';
import navShares from './nav-shares.png';
import navSharesOn from './nav-shares-on.png';
import navOrg from './nav-org.png';
import navOrgOn from './nav-org-on.png';
import navSettings from './nav-settings.png';
import navSettingsOn from './nav-settings-on.png';
import navLogout from './nav-logout.png';
import statElders from './stat-elders.png';
import statSessions from './stat-sessions.png';
import statChronicles from './stat-chronicles.png';
import statAi from './stat-ai.png';
import markNaver from './mark-naver.png';
import markKakao from './mark-kakao.png';
import markGoogle from './mark-google.png';
import iconEye from './icon-eye.png';
import iconCheckbox from './icon-checkbox.png';
import iconKey from './icon-key.png';
import iconPencil from './icon-pencil.png';
import iconCaregiver from './icon-caregiver.png';
import iconCalendar from './icon-calendar.png';
import iconClock from './icon-clock.png';
import iconShield from './icon-shield.png';
import iconCheckCircle from './icon-check-circle.png';
import iconRevoke from './icon-revoke.png';
import iconCopy from './icon-copy.png';
import iconRefresh from './icon-refresh.png';
import iconTrash from './icon-trash.png';
import iconCamera from './icon-camera.png';
import iconPlus from './icon-plus.png';
import iconClose from './icon-close.png';
import landingHero from './landing-hero.png';
import landingWordmarkHero from './landing-wordmark-hero.png';
import landingSpot1 from './landing-spot-1.png';
import landingSpot2 from './landing-spot-2.png';
import landingSpot3 from './landing-spot-3.png';
import landingWordmarkCta from './landing-wordmark-cta.png';
import landingWordmarkSub from './landing-wordmark-sub.png';
import landingIllustShare from './landing-illust-share.png';
import landingFeatElders from './landing-feat-elders.png';
import landingFeatRecords from './landing-feat-records.png';
import landingFeatAnalysis from './landing-feat-analysis.png';
import landingFeatShare from './landing-feat-share.png';
import landingNotch from './landing-notch.png';
import landingBars from './landing-bars.png';

export const asset = {
  wordmark,
  iconSearch,
  iconSearchField,
  iconPencilLg,
  iconTrashLg,
  iconCalendarSm,
  iconChevronDownSm,
  iconChevronDownMd,
  iconCloseSm,
  iconPhotoUpload,
  iconClockSm,
  iconChevronRightSm,
  avatarAi,
  iconBell,
  iconChevronDown,
  iconChevronRight,
  iconKey,
  iconPencil,
  iconCaregiver,
  iconCalendar,
  iconClock,
  iconShield,
  iconCheckCircle,
  iconRevoke,
  iconCopy,
  iconRefresh,
  iconTrash,
  iconCamera,
  iconPlus,
  iconClose,
  avatarDefault,
  navLogout,
  statElders,
  statSessions,
  statChronicles,
  statAi,
  markNaver,
  markKakao,
  markGoogle,
  iconEye,
  iconCheckbox,
  landingHero,
  landingWordmarkHero,
  landingSpot1,
  landingSpot2,
  landingSpot3,
  landingWordmarkCta,
  landingWordmarkSub,
  landingIllustShare,
  landingFeatElders,
  landingFeatRecords,
  landingFeatAnalysis,
  landingFeatShare,
  landingNotch,
  landingBars,
} as const;

/** 사이드바 아이콘 — [비활성, 활성] 쌍. */
export const navIcon = {
  dashboard: [navDashboard, navDashboardOn],
  elders: [navElders, navEldersOn],
  sessions: [navSessions, navSessionsOn],
  analysis: [navAnalysis, navAnalysisOn],
  journal: [navJournal, navJournalOn],
  shares: [navShares, navSharesOn],
  org: [navOrg, navOrgOn],
  settings: [navSettings, navSettingsOn],
} as const;

export type NavIconKey = keyof typeof navIcon;
