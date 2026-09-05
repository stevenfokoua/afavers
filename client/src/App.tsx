import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AdminRoute } from './routes/AdminRoute';
import { OnboardingRedirect } from './routes/OnboardingRedirect';
import { AppLayout } from './components/layout/AppLayout';

const LoginPage         = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage      = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage  = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const DashboardPage     = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const JobsPage          = lazy(() => import('./pages/JobsPage').then(m => ({ default: m.JobsPage })));
const JobDetailPage     = lazy(() => import('./pages/JobDetailPage').then(m => ({ default: m.JobDetailPage })));
const KanbanPage        = lazy(() => import('./pages/KanbanPage').then(m => ({ default: m.KanbanPage })));
const SettingsPage      = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SetupPage         = lazy(() => import('./pages/SetupPage').then(m => ({ default: m.SetupPage })));
const AnalyticsPage     = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const HotpicksPage      = lazy(() => import('./pages/HotpicksPage').then(m => ({ default: m.HotpicksPage })));
const InterviewPrepPage = lazy(() => import('./pages/InterviewPrepPage').then(m => ({ default: m.InterviewPrepPage })));
const CareerGuidesPage  = lazy(() => import('./pages/CareerGuidesPage').then(m => ({ default: m.CareerGuidesPage })));
const LandingPage       = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const DisclaimerPage    = lazy(() => import('./pages/DisclaimerPage').then(m => ({ default: m.DisclaimerPage })));
const DemoJobsPage      = lazy(() => import('./pages/DemoJobsPage').then(m => ({ default: m.DemoJobsPage })));
const RemindersPage     = lazy(() => import('./pages/RemindersPage').then(m => ({ default: m.RemindersPage })));
const NewsPage          = lazy(() => import('./pages/NewsPage').then(m => ({ default: m.NewsPage })));
const AdminPage         = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AdminLoginPage    = lazy(() => import('./pages/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })));


const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <OnboardingRedirect>
      <AppLayout>{children}</AppLayout>
    </OnboardingRedirect>
  </ProtectedRoute>
);

const RootRedirect = () => {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />;
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard"    element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/jobs"         element={<ProtectedLayout><JobsPage /></ProtectedLayout>} />
        <Route path="/jobs/:id"     element={<ProtectedLayout><JobDetailPage /></ProtectedLayout>} />
        <Route path="/kanban"       element={<ProtectedLayout><KanbanPage /></ProtectedLayout>} />
        <Route path="/settings"     element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />
        <Route path="/setup"        element={<ProtectedLayout><SetupPage /></ProtectedLayout>} />
        <Route path="/analytics"    element={<ProtectedLayout><AnalyticsPage /></ProtectedLayout>} />
        <Route path="/hotpicks"        element={<ProtectedLayout><HotpicksPage /></ProtectedLayout>} />
        <Route path="/interview-prep" element={<ProtectedLayout><InterviewPrepPage /></ProtectedLayout>} />
        <Route path="/career-guides"  element={<ProtectedLayout><CareerGuidesPage /></ProtectedLayout>} />
        <Route path="/reminders"      element={<ProtectedLayout><RemindersPage /></ProtectedLayout>} />
        <Route path="/news"           element={<ProtectedLayout><NewsPage /></ProtectedLayout>} />
        <Route path="/werkstudent"    element={<Navigate to="/jobs?type=werkstudent" replace />} />
        <Route path="/admin" element={
          <AdminRoute>
            <AppLayout><AdminPage /></AppLayout>
          </AdminRoute>
        } />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="/demo" element={<DemoJobsPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/" element={<RootRedirect />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
