import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe } from '../api';
import { clearToken, setToken as persistToken } from './tokenStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await fetchMe();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 카카오/구글 딥링크(zonemate://auth-callback?token=...)로 받은 토큰을
  // 저장하고 사용자 정보를 새로 받아온다.
  const signIn = useCallback(async (token) => {
    await persistToken(token);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
