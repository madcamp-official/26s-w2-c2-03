import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe, logout as apiLogout } from '../api.js';

const AuthContext = createContext(null);

// 로그인 시 백엔드가 httpOnly 쿠키(token)와 함께 심어주는 non-httpOnly
// 쿠키(authToken, 같은 값)를 읽는다 — Electron 메인 프로세스는 이 창의
// 쿠키 저장소에 접근할 수 없어서, 렌더러가 대신 읽어 IPC로 건네줘야
// 메인 프로세스가 집중 이벤트 기록·실시간 세션 동기화 요청을 보낼 수 있다.
function readAuthTokenCookie() {
  const match = document.cookie.match(/(?:^|; )authToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await fetchMe();
      setUser(user);
      window.zonemate?.setAuthToken?.(readAuthTokenCookie());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function logout() {
    await apiLogout();
    setUser(null);
    window.zonemate?.clearAuthToken?.();
  }

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
