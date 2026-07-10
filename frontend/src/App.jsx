import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import NicknamePage from './pages/NicknamePage.jsx';
import PlannerPage from './pages/PlannerPage.jsx';

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
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
