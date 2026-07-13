import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import NicknamePage from './pages/NicknamePage.jsx';
import PlannerPage from './pages/PlannerPage.jsx';
import TodayPage from './pages/TodayPage.jsx';
import DeadlinesPage from './pages/DeadlinesPage.jsx';
import VersionBadge from './components/VersionBadge.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.nickname) return <Navigate to="/nickname" replace />;
  return children;
}

function RequireNoNickname({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.nickname) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/nickname"
            element={(
              <RequireNoNickname>
                <NicknamePage />
              </RequireNoNickname>
            )}
          />
          <Route
            path="/"
            element={(
              <RequireAuth>
                <PlannerPage />
              </RequireAuth>
            )}
          >
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="deadlines" element={<DeadlinesPage />} />
          </Route>
        </Routes>
        <VersionBadge />
      </BrowserRouter>
    </AuthProvider>
  );
}
