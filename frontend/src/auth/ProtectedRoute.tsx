import { Navigate, Outlet } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-6">
          <img
            src={logo}
            alt="شعار النظام"
            className="h-20 w-auto bg-primary object-contain object-center md:h-28"
          />
          <div className="size-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'ADMIN') {
    return <Navigate to="/scores" replace />;
  }

  return <Outlet />;
}
