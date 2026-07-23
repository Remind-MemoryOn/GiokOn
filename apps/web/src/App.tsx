import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CaregiverLayout } from './components/Layout';
import { ToastShelf } from './components/ui/Toast';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { FindIdPage } from './pages/FindIdPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { EldersPage } from './pages/EldersPage';
import { ElderDetailPage } from './pages/ElderDetailPage';
import { LogsPage } from './pages/LogsPage';
import { LogDetailPage } from './pages/LogDetailPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { CareJournalPage } from './pages/CareJournalPage';
import { SharesPage } from './pages/SharesPage';
import { OrgPage } from './pages/OrgPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacyPolicyPage, TermsPage } from './pages/LegalPages';
import { GuardianDashboardPage } from './pages/GuardianDashboardPage';
import { useAuth } from './auth/AuthProvider';

// 인증(T17.4 + 2026-07-23 이메일 병행): 로그인=이메일(아이디)+비밀번호 및 소셜
// 3종(/login) · 아이디 찾기(/find-id) · 비밀번호 찾기(/forgot-password) · 재설정
// (/reset-password) → 온보딩 게이트(/onboarding) → 역할 기반 자동 라우팅
// (caregiver·org_admin→/caregiver, guardian→/guardian).

function CaregiverGuard({ children }: { children: React.ReactNode }) {
  const { session, userRow, loading } = useAuth();
  if (loading) return null; // 세션·역할 판별 중 — 깜빡임 방지
  if (!session) return <Navigate to="/login" replace />;
  if (!userRow || !userRow.onboarded_at) return <Navigate to="/onboarding" replace />;
  if (userRow.role === 'guardian') return <Navigate to="/guardian" replace />;
  return <>{children}</>;
}

function GuardianGuard({ children }: { children: React.ReactNode }) {
  const { session, userRow, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (!userRow || !userRow.onboarded_at) return <Navigate to="/onboarding" replace />;
  if (userRow.role !== 'guardian') return <Navigate to="/caregiver" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/find-id" element={<FindIdPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* 구 로그인 경로 → 통합 로그인으로 */}
        <Route path="/caregiver/login" element={<Navigate to="/login" replace />} />
        <Route path="/guardian/login" element={<Navigate to="/login" replace />} />

        {/* 요양보호사 영역 */}
        <Route
          path="/caregiver"
          element={
            <CaregiverGuard>
              <CaregiverLayout />
            </CaregiverGuard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="elders" element={<EldersPage />} />
          <Route path="elders/:elderId" element={<ElderDetailPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="logs/:logId" element={<LogDetailPage />} />
          <Route path="analysis" element={<AnalysisPage />} />
          <Route path="journal" element={<CareJournalPage />} />
          <Route path="shares" element={<SharesPage />} />
          <Route path="org" element={<OrgPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 어르신 대화(TTS/STT)는 모바일 앱 담당 — 웹에는 없음 */}

        {/* 보호자 영역 (실계정 + 승인된 연결만) */}
        <Route
          path="/guardian"
          element={
            <GuardianGuard>
              <GuardianDashboardPage />
            </GuardianGuard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastShelf />
    </BrowserRouter>
  );
}

export default App;
