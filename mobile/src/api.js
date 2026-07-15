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
export const fetchMe = () => request('/api/auth/me');
export const setNickname = (nickname) => request('/api/auth/nickname', { method: 'POST', body: { nickname } });

// 카카오/구글은 서버 리다이렉트 플로우라 브라우저 세션(expo-web-browser)에서
// 열 URL만 필요하다 — redirectUrl(Linking.createURL 결과)을 그대로 넘겨야
// 콜백이 정확한 딥링크로 토큰을 실어 돌아온다. Expo Go에서는 이 값이
// zonemate:// 가 아니라 exp://<lan-ip>:8081/--/auth-callback 형태라
// 서버에 고정 스킴으로 하드코딩할 수 없다(backend/src/routes/auth.js 참고).
export const kakaoLoginUrl = (redirectUrl) =>
  `${API_BASE_URL}/api/auth/kakao?platform=mobile&redirect_uri=${encodeURIComponent(redirectUrl)}`;
export const googleLoginUrl = (redirectUrl) =>
  `${API_BASE_URL}/api/auth/google?platform=mobile&redirect_uri=${encodeURIComponent(redirectUrl)}`;

// ---- 기기 연동 ----
export const pairDevice = ({ code, name, platform }) => request('/api/devices/pair', { method: 'POST', body: { code, name, platform } });
export const fetchDevices = () => request('/api/devices');
export const removeDevice = (id) => request(`/api/devices/${id}`, { method: 'DELETE' });

// ---- 오늘의 계획 / 캘린더 ----
export const fetchPlannerData = () => request('/api/planner-data');
export const savePlannerData = ({ tasks, events, dayEndTime, dayEndDate }) =>
  request('/api/planner-data', { method: 'PUT', body: { tasks, events, dayEndTime, dayEndDate } });
export const generatePlanChat = ({ messages, forceFinalize }) =>
  request('/api/plan', { method: 'POST', body: { messages, forceFinalize } });
export const generateDeadlineRoadmap = ({ title, details, deadline }) =>
  request('/api/deadline-tasks', { method: 'POST', body: { title, details, deadline } });
// 지난 날짜의 "오늘의 계획" 스냅샷. 오늘 날짜는 planner-data의 라이브 tasks를
// 쓰고, 그 외 날짜만 이걸로 불러온다(데스크톱 DatePlanEditor와 같은 규칙).
export const fetchDailyArchive = (date) => request(`/api/daily-archives/${date}`);
// 그 날의 집중 세션 기록(데스크톱이 추적한 timeline·통계 포함). 데스크톱에서
// 한 집중을 모바일 캘린더에서 그래프로 보여주는 데 쓴다.
export const fetchFocusDay = (date) => request(`/api/focus-events/day/${date}`);

// ---- 실시간 집중 세션(3단계) ----
export const fetchFocusSession = () => request('/api/focus-session');
export const pushFocusSession = (payload) => request('/api/focus-session', { method: 'PUT', body: payload });
export const stopFocusSessionRemote = () => request('/api/focus-session/stop', { method: 'POST' });
