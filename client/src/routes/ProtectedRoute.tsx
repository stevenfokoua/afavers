import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasCheckedSession = useAuthStore((state) => state.hasCheckedSession);

  if (!hasCheckedSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p role="status">Loading / Lädt…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
