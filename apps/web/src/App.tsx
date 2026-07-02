import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CaregiverLayout } from './components/Layout';
import { ToastShelf } from './components/ui/Toast';
import { LandingPage } from './pages/LandingPage';
import { CaregiverLoginPage } from './pages/CaregiverLoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EldersPage } from './pages/EldersPage';
import { ElderDetailPage } from './pages/ElderDetailPage';
import { LogsPage } from './pages/LogsPage';
import { LogDetailPage } from './pages/LogDetailPage';
import { DressUpPage } from './pages/DressUpPage';
import { ElderHomePage } from './pages/ElderHomePage';
import { ElderDressUpPage } from './pages/ElderDressUpPage';
import { ConversePage } from './pages/ConversePage';
import { GuardianLoginPage } from './pages/GuardianLoginPage';
import { GuardianHomePage } from './pages/GuardianHomePage';
import { seedIfEmpty } from './lib/seed';
import { primeVoices } from './lib/speech';
import { useAuth } from './auth/AuthProvider';

function CaregiverGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null; // 세션 조회 중 — 깜빡임 방지
  if (!session) return <Navigate to="/caregiver/login" replace />;
  return <>{children}</>;
}

function App() {
  useEffect(() => {
    seedIfEmpty();
    void primeVoices();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/caregiver/login" element={<CaregiverLoginPage />} />

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
          <Route path="elders/:elderId/dress" element={<DressUpPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="logs/:logId" element={<LogDetailPage />} />
        </Route>

        {/* 어르신 영역 — 요양보호사가 시작시킨 후 진입 */}
        <Route path="/elder" element={<ElderHomePage />} />
        <Route path="/elder/:elderId" element={<ElderHomePage />} />
        <Route path="/elder/:elderId/dress" element={<ElderDressUpPage />} />
        <Route path="/elder/converse/:logId" element={<ConversePage />} />

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
