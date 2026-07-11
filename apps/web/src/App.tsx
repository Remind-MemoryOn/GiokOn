import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CaregiverLayout } from './components/Layout';
import { ToastShelf } from './components/ui/Toast';
import { LandingPage } from './pages/LandingPage';
import { CaregiverLoginPage } from './pages/CaregiverLoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { EldersPage } from './pages/EldersPage';
import { ElderDetailPage } from './pages/ElderDetailPage';
import { LogsPage } from './pages/LogsPage';
import { LogDetailPage } from './pages/LogDetailPage';
import { OrgPage } from './pages/OrgPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrivacyPolicyPage, TermsPage } from './pages/LegalPages';
import { GuardianLoginPage } from './pages/GuardianLoginPage';
import { GuardianHomePage } from './pages/GuardianHomePage';
import { useAuth } from './auth/AuthProvider';

function CaregiverGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null; // 세션 조회 중 — 깜빡임 방지
  if (!session) return <Navigate to="/caregiver/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/caregiver/login" element={<CaregiverLoginPage />} />
        <Route path="/caregiver/reset" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />

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
          <Route path="org" element={<OrgPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 어르신 대화(TTS/STT)는 모바일 앱 담당 — 웹에는 없음 */}

        {/* 보호자 영역 */}
        <Route path="/guardian/login" element={<GuardianLoginPage />} />
        <Route path="/guardian" element={<GuardianHomePage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastShelf />
    </BrowserRouter>
  );
}

export default App;
