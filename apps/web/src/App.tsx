import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { CaregiverLayout, GuardianLayout } from './components/Layout';
import { ToastShelf } from './components/ui/Toast';
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { OnboardingPage } from './pages/public/OnboardingPage';
import { SignUpPage } from './pages/public/SignUpPage';
import { FindIdPage } from './pages/public/FindIdPage';
import { ForgotPasswordPage } from './pages/public/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/public/ResetPasswordPage';
import { GuidePage } from './pages/public/GuidePage';
import { ConsentDocumentPage, PrivacyPolicyPage, TermsPage } from './pages/public/LegalPages';
import {
  InquiryDetailPage,
  InquiryFormPage,
  InquiryListPage,
} from './pages/public/InquiryPages';
import { DashboardPage } from './pages/caregiver/DashboardPage';
import { EldersPage } from './pages/caregiver/EldersPage';
import { ElderDetailPage } from './pages/caregiver/ElderDetailPage';
import { ElderConsentsPage } from './pages/caregiver/ElderConsentsPage';
import { ElderEditPage } from './pages/caregiver/ElderEditPage';
import { ElderChroniclesPage } from './pages/caregiver/ElderChroniclesPage';
import { ChronicleDialog } from './pages/caregiver/ChronicleDialog';
import { ElderRegisterDialog } from './pages/caregiver/ElderRegisterDialog';
import { SessionsPage } from './pages/caregiver/SessionsPage';
import { SessionListPage } from './pages/caregiver/SessionListPage';
import { SessionPlanDialog } from './pages/caregiver/SessionPlanDialog';
import { ConversationLogPage } from './pages/caregiver/ConversationLogPage';
import { AnalysisPage } from './pages/caregiver/AnalysisPage';
import { AnalysisEldersPage } from './pages/caregiver/AnalysisEldersPage';
import { AnalysisElderPage } from './pages/caregiver/AnalysisElderPage';
import { ConversationAnalysisListPage } from './pages/caregiver/ConversationAnalysisListPage';
import { ConversationAnalysisPage } from './pages/caregiver/ConversationAnalysisPage';
import { JournalPage } from './pages/caregiver/JournalPage';
import { ProgramJournalListPage } from './pages/caregiver/ProgramJournalListPage';
import { ProgramJournalDetailPage } from './pages/caregiver/ProgramJournalDetailPage';
import { SharesPage } from './pages/caregiver/SharesPage';
import { ShareItemsPage } from './pages/caregiver/ShareItemsPage';
import { ShareHistoryPage } from './pages/caregiver/ShareHistoryPage';
import { OrgPage } from './pages/caregiver/OrgPage';
import { SettingsPage } from './pages/caregiver/SettingsPage';
import { ConnectPage } from './pages/guardian/ConnectPage';
import { FeedPage } from './pages/guardian/FeedPage';
import { JournalDetailPage } from './pages/guardian/JournalDetailPage';
import { SummaryDetailPage } from './pages/guardian/SummaryDetailPage';
import { SettingsPage as GuardianSettingsPage } from './pages/guardian/SettingsPage';
import { AnalysisPage as GuardianAnalysisPage } from './pages/guardian/AnalysisPage';
import { AnalysisSessionsPage as GuardianAnalysisSessionsPage } from './pages/guardian/AnalysisSessionsPage';
import { AnalysisSessionPage as GuardianAnalysisSessionPage } from './pages/guardian/AnalysisSessionPage';
import { useAuth } from './auth/AuthProvider';
import { isAwaitingOrgJoin } from '@giokon/data';
import { JoinPendingPage } from './pages/public/JoinPendingPage';
import { SupervisionPage } from './pages/caregiver/SupervisionPage';
import { useViewportMode } from './lib/viewportMode';
import { loginPath } from './auth/routes';

// 신규 Figma 디자인(4iU6Zw4MhLAMZWlnPFgsCI) 기준 정보구조.
// 화면↔노드 맵: docs/runbooks/figma-web-extraction.md
//   공개      서비스 소개 · 이용안내 · 로그인 · 회원가입 · 아이디/비번 찾기 · 재설정
//   요양보호사 대시보드 · 어르신 관리 · 세션 기록 · 분석 · 프로그램 일지 · 공개 관리 · 기관 관리 · 설정
//   보호자    어르신 연결 · 공개된 소식 · 분석 · 설정

function CaregiverGuard({ children }: { children: React.ReactNode }) {
  const { session, userRow, loading } = useAuth();
  const location = useLocation();
  if (loading) return null; // 세션·역할 판별 중 — 깜빡임 방지
  if (!session) return <Navigate to={loginPath(location.pathname + location.search + location.hash)} replace />;
  if (!userRow || !userRow.onboarded_at) return <Navigate to="/onboarding" replace />;
  if (userRow.role === 'guardian') return <Navigate to="/guardian" replace />;
  // 초대 코드로 가입해 승인을 기다리는(기관 없는) 계정 — 기관 데이터가 0건이라 빈 화면이 "기록 없음"으로 보인다.
  if (isAwaitingOrgJoin(userRow)) return <Navigate to="/join-pending" replace />;
  return <>{children}</>;
}

function GuardianGuard({ children }: { children: React.ReactNode }) {
  const { session, userRow, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!session) return <Navigate to={loginPath(location.pathname + location.search + location.hash)} replace />;
  if (!userRow || !userRow.onboarded_at) return <Navigate to="/onboarding" replace />;
  if (userRow.role !== 'guardian') return <Navigate to="/caregiver" replace />;
  return <>{children}</>;
}

/** 경로별 화면 폭 모드(1440 캔버스 / 감독 화면 반응형) — src/lib/viewportMode.ts */
function ViewportMode() {
  useViewportMode();
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ViewportMode />
      <Routes>
        {/* ── 공개 ── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/guide" element={<GuidePage />} />
        {/* 처리방침·약관은 이용안내(#privacy · #terms 앵커) 외에 단독 URL 도 갖는다 —
            로그인·온보딩의 법적 링크와 푸터가 여기를 가리킨다(2026-09-02 사용자 확정). */}
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/consents/:documentId" element={<ConsentDocumentPage />} />
        <Route path="/inquiries" element={<InquiryListPage />} />
        <Route path="/inquiries/new" element={<InquiryFormPage />} />
        <Route path="/inquiries/:inquiryId" element={<InquiryDetailPage />} />
        <Route path="/inquiries/:inquiryId/edit" element={<InquiryFormPage edit />} />
        <Route path="/login" element={<LoginPage />} />
        {/* 디자인엔 이메일 가입 폼이 없지만(시안은 소셜 가입 전제) 이메일 로그인이 살아 있어
            가입 경로가 필요하다 — 찾기 화면의 실측 골격을 한 칸 연장해 쓴다. */}
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        {/* 초대 코드 합류의 승인 대기(파일럿 W9) — Figma 에 없는 화면이라 온보딩과 같은 체계로 최소 구현 */}
        <Route path="/join-pending" element={<JoinPendingPage />} />
        <Route path="/find-id" element={<FindIdPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* ── 요양보호사 ── */}
        {/* 감독 화면(파일럿 W2) — 휴대폰 브라우저가 기본이라 1440 셸 밖의 반응형 단독 화면. 가드는 같다. */}
        <Route
          path="/caregiver/supervision"
          element={
            <CaregiverGuard>
              <SupervisionPage />
            </CaregiverGuard>
          }
        />
        <Route
          path="/caregiver"
          element={
            <CaregiverGuard>
              <CaregiverLayout />
            </CaregiverGuard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="elders" element={<EldersPage />}>
            {/* 어르신 등록도 목록 위에 뜨는 모달이다(Figma 172:330) */}
            <Route path="new" element={<ElderRegisterDialog />} />
          </Route>
          <Route path="elders/:elderId" element={<ElderDetailPage />} />
          <Route path="elders/:elderId/consents" element={<ElderConsentsPage />} />
          <Route path="elders/:elderId/edit" element={<ElderEditPage />} />
          {/* 연대기 추가·상세는 목록 위에 뜨는 **모달**이다(Figma 196:271 · 198:991) */}
          <Route path="elders/:elderId/chronicles" element={<ElderChroniclesPage />}>
            <Route path="new" element={<ChronicleDialog mode="add" />} />
            <Route path=":chronicleId" element={<ChronicleDialog mode="edit" />} />
          </Route>
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:elderId" element={<SessionListPage />}>
            {/* 회상 세션 설계도 목록 위에 뜨는 모달이다(Figma 196:272) */}
            <Route path="new" element={<SessionPlanDialog />} />
            <Route path="plan/:sessionId" element={<SessionPlanDialog />} />
          </Route>
          <Route path="sessions/:elderId/:sessionId" element={<ConversationLogPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="analysis/elders" element={<AnalysisEldersPage />} />
          <Route path="analysis/:elderId" element={<AnalysisElderPage />} />
          {/* 개인별 종합 분석(228:4091)은 위 `analysis/:elderId` 가 그 화면이다.
              이관 중에 쓰던 `/overall` 경로로 들어오면 그리로 보낸다(예전 링크 보존). */}
          <Route path="analysis/:elderId/overall" element={<Navigate to=".." relative="path" replace />} />
          <Route path="analysis/:elderId/sessions" element={<ConversationAnalysisListPage />} />
          <Route path="analysis/:elderId/sessions/:sessionId" element={<ConversationAnalysisPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="journal/:elderId" element={<ProgramJournalListPage />} />
          <Route path="journal/:elderId/new" element={<ProgramJournalDetailPage />} />
          {/* 목록의 연필 — 같은 화면이 상세(확인·수정·확정·이력)다 */}
          <Route path="journal/:elderId/:journalId" element={<ProgramJournalDetailPage />} />
          <Route path="shares" element={<SharesPage />} />
          <Route path="shares/:elderId" element={<ShareItemsPage />} />
          <Route path="shares/:elderId/history" element={<ShareHistoryPage />} />
          <Route path="org" element={<OrgPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* ── 보호자 ── */}
        <Route
          path="/guardian"
          element={
            <GuardianGuard>
              <GuardianLayout />
            </GuardianGuard>
          }
        >
          <Route index element={<ConnectPage />} />
          <Route path="feed" element={<FeedPage />} />
          <Route path="feed/journal/:itemId" element={<JournalDetailPage />} />
          <Route path="feed/summary/:itemId" element={<SummaryDetailPage />} />
          <Route path="analysis" element={<GuardianAnalysisPage />} />
          <Route path="analysis/sessions" element={<GuardianAnalysisSessionsPage />} />
          <Route path="analysis/sessions/:sessionId" element={<GuardianAnalysisSessionPage />} />
          <Route path="settings" element={<GuardianSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastShelf />
    </BrowserRouter>
  );
}

export default App;
