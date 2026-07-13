import { API_BASE_URL } from './config';
import { getToken } from './auth/tokenStore';

async function request(path, { method = 'GET', body } = {}) {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || '요청에 실패했어요');
  }
  return res.json();
}

// ---- 인증 ----
export const sendVerificationCode = (payload) => request('/api/auth/email/send-code', { method: 'POST', body: payload });
export const verifyEmailCode = (payload) => request('/api/auth/email/verify', { method: 'POST', body: payload });
export const login = (payload) => request('/api/auth/login', { method: 'POST', body: payload });
export const fetchMe = () => request('/api/auth/me');
export const setNickname = (nickname) => request('/api/auth/nickname', { method: 'POST', body: { nickname } });

// 카카오/구글은 서버 리다이렉트 플로우라 브라우저 세션(expo-web-browser)에서
// 열 URL만 필요하다 — ?platform=mobile을 주면 콜백이 zonemate:// 딥링크로
// 토큰을 실어 돌아온다(backend/src/routes/auth.js 참고).
export const kakaoLoginUrl = () => `${API_BASE_URL}/api/auth/kakao?platform=mobile`;
export const googleLoginUrl = () => `${API_BASE_URL}/api/auth/google?platform=mobile`;

// ---- 기기 연동 ----
export const pairDevice = ({ code, name, platform }) => request('/api/devices/pair', { method: 'POST', body: { code, name, platform } });
export const fetchDevices = () => request('/api/devices');
export const removeDevice = (id) => request(`/api/devices/${id}`, { method: 'DELETE' });

// ---- 오늘의 계획 / 캘린더 (2단계에서 화면과 함께 채울 자리) ----
export const fetchPlannerData = () => request('/api/planner-data');
