import * as SecureStore from 'expo-secure-store';

// 데스크톱/웹은 httpOnly 쿠키로 세션을 유지하지만, 모바일 앱에서는 쿠키
// 지속성이 앱 재시작 사이에 불안정하다 — 그래서 발급받은 JWT를 기기의
// 보안 저장소(Keychain/Keystore)에 직접 보관하고 Authorization 헤더로
// 보낸다(백엔드는 backend/src/middleware/requireAuth.js에서 이미 이
// 방식을 지원하도록 확장해뒀다).
const TOKEN_KEY = 'zonemate.authToken';

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
