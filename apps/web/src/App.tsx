import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CaregiverLayout } from './components/Layout';
import { ToastShelf } from './components/ui/Toast';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { JoinPage } from './pages/JoinPage';
import { DashboardPage } from './pages/DashboardPage';
import { EldersPage } from './pages/EldersPage';
import { ElderDetailPage } from './pages/ElderDetailPage';
import { LogsPage } from './pages/LogsPage';
import { LogDetailPage } from './pages/LogDetailPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { OrgPage } from './pages/OrgPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacyPolicyPage, TermsPage } from './pages/LegalPages';
import { GuardianDashboardPage } from './pages/GuardianDashboardPage';
import { useAuth } from './auth/AuthProvider';

// 인증 개편(T17.4): 로그인=소셜 3종 단일 진입(/login) → 온보딩 게이트(/onboarding)
// → 역할 기반 자동 라우팅(caregiver·org_admin→/caregiver, guardian→/guardian).
// 이메일 로그인·비밀번호 재설정·보호자 데모 로그인 경로는 제거됨.

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
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
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
