import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CaregiverLayout, GuardianLayout } from './components/Layout';
import { ToastShelf } from './components/ui/Toast';
import { Pending } from './pages/Pending';
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { OnboardingPage } from './pages/public/OnboardingPage';
import { FindIdPage } from './pages/public/FindIdPage';
import { ForgotPasswordPage } from './pages/public/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/public/ResetPasswordPage';
import { GuidePage } from './pages/public/GuidePage';
import { DashboardPage } from './pages/caregiver/DashboardPage';
import { EldersPage } from './pages/caregiver/EldersPage';
import { ElderDetailPage } from './pages/caregiver/ElderDetailPage';
import { ElderEditPage } from './pages/caregiver/ElderEditPage';
import { ElderChroniclesPage } from './pages/caregiver/ElderChroniclesPage';
import { ChronicleDialog } from './pages/caregiver/ChronicleDialog';
import { ElderRegisterDialog } from './pages/caregiver/ElderRegisterDialog';
import { SessionsPage } from './pages/caregiver/SessionsPage';
import { SessionListPage } from './pages/caregiver/SessionListPage';
import { SessionPlanDialog } from './pages/caregiver/SessionPlanDialog';
import { ConversationLogPage } from './pages/caregiver/ConversationLogPage';
import { AnalysisPage } from './pages/caregiver/AnalysisPage';
import { useAuth } from './auth/AuthProvider';

// 신규 Figma 디자인(4iU6Zw4MhLAMZWlnPFgsCI) 기준 정보구조.
// 화면↔노드 맵: docs/runbooks/figma-web-extraction.md
//   공개      서비스 소개 · 이용안내 · 로그인 · 회원가입 · 아이디/비번 찾기 · 재설정
//   요양보호사 대시보드 · 어르신 관리 · 세션 기록 · 분석 · 요양일지 · 공개 관리 · 기관 관리 · 설정
//   보호자    어르신 연결 · 공개된 소식 · 분석 · 설정

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
        {/* ── 공개 ── */}
        <Route path="/" element={<LandingPage />} />
        {/* 처리방침·약관은 이용안내 한 화면에 통합돼 있다(#privacy · #terms 앵커) */}
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* 디자인에는 이메일 가입 폼이 없다 — 회원가입 = 소셜 로그인 후 기본 정보 입력 */}
        <Route path="/signup" element={<OnboardingPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/find-id" element={<FindIdPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* ── 요양보호사 ── */}
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
          <Route path="analysis/elders" element={<Pending title="개인별 분석 목록" node="228:3722" />} />
          <Route path="analysis/:elderId" element={<Pending title="개인별 분석" node="228:3722" />} />
          <Route path="analysis/:elderId/overall" element={<Pending title="종합 분석" node="228:4091" />} />
          <Route path="analysis/:elderId/sessions" element={<Pending title="대화 분석 목록" node="228:4628" />} />
          <Route path="analysis/:elderId/sessions/:sessionId" element={<Pending title="대화 분석" node="228:4430" />} />
          <Route path="journal" element={<Pending title="요양일지" node="205:1039" />} />
          <Route path="journal/:elderId" element={<Pending title="요양일지 목록" node="207:1147" />} />
          <Route path="journal/:elderId/new" element={<Pending title="요양일지 작성" node="221:283" />} />
          <Route path="shares" element={<Pending title="공개 관리" node="135:1288" />} />
          <Route path="shares/:elderId" element={<Pending title="공개 관리" node="140:121" />} />
          <Route path="shares/:elderId/history" element={<Pending title="공개 이력" node="146:1067" />} />
          <Route path="org" element={<Pending title="기관 관리" node="131:959" />} />
          <Route path="settings" element={<Pending title="설정" node="121:598" />} />
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
          <Route index element={<Pending title="어르신 연결" node="31:616" />} />
          <Route path="feed" element={<Pending title="공개된 소식" node="50:543" />} />
          <Route path="feed/journal/:itemId" element={<Pending title="요양일지" node="50:1102" />} />
          <Route path="feed/summary/:itemId" element={<Pending title="대화 요약" node="55:1258" />} />
          <Route path="analysis" element={<Pending title="종합 분석" node="96:94" />} />
          <Route path="analysis/sessions" element={<Pending title="대화 분석" node="104:1041" />} />
          <Route path="analysis/sessions/:sessionId" element={<Pending title="대화 분석" node="104:1830" />} />
          <Route path="settings" element={<Pending title="설정" node="334:697" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastShelf />
    </BrowserRouter>
  );
}

export default App;
