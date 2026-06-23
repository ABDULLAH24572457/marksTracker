import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RankingsPage } from './pages/RankingsPage';
import { ScoresPage } from './pages/ScoresPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/scores" element={<ScoresPage />} />

          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
