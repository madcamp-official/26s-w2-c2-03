import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { issueToken } from '../services/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const APP_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_BASE_URL || 'http://localhost:4000';

// 모바일 클라이언트가 보낸 실제 딥링크 주소를 state에 실어 콜백까지 왕복시킨다.
// Expo Go에서 실행 중일 때는 app.json의 커스텀 스킴(zonemate://)이 아니라
// exp://<lan-ip>:8081/--/auth-callback 같은 주소가 실제 딥링크이기 때문에,
// 고정된 스킴을 하드코딩하면 Expo Go에서는 "주소가 유효하지 않음" 에러가 난다.
function encodeMobileState(redirectUrl) {
  return `mobile:${Buffer.from(redirectUrl, 'utf8').toString('base64url')}`;
}
function decodeMobileState(state) {
  if (!state || !state.startsWith('mobile:')) return null;
  try {
    return Buffer.from(state.slice('mobile:'.length), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// httpOnly 쿠키(token)는 브라우저 fetch(credentials:'include')가 자동으로
// 실어 보내는 진짜 세션이고, 그 값을 그대로 담은 두 번째 non-httpOnly
// 쿠키(authToken)는 오직 "Electron 메인 프로세스에게 넘겨주기 위해 렌더러가
// document.cookie로 읽을 수 있게" 존재한다 — Electron 메인 프로세스는 창의
// 쿠키 저장소에 접근할 수 없어서(별도 Node 프로세스), 렌더러가 로그인 시
// 이 값을 읽어 IPC로 건네주면 메인 프로세스가 백엔드에 자기 명의로(집중
// 이벤트 기록 등) 요청할 수 있다. 두 쿠키는 항상 같은 토큰 값을 담는다.
function setSessionCookie(res, userId) {
  const token = issueToken(userId);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS });
  res.cookie('authToken', token, { httpOnly: false, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS });
  return token;
}

function toPublicUser(user) {
  return { id: user.id, email: user.email, nickname: user.nickname, provider: user.provider };
}

function upsertOAuthUser({ provider, providerId, email }) {
  const existing = db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
    .get(provider, providerId);
  if (existing) return existing;

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, provider, provider_id, email_verified) VALUES (?, ?, ?, ?, 1)`
  ).run(id, email, provider, providerId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ---- 구글 로그인 ----
// state에 플랫폼을 실어 보내고 콜백에서 그대로 돌려받는다(OAuth 표준
// 파라미터라 구글/카카오 둘 다 그대로 echo해준다) — 모바일에서 시작한
// 로그인인지 구분해서, 콜백에서 웹 프론트 대신 앱 딥링크로 보내기 위함.

router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${API_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    ...(req.query.platform === 'mobile' && req.query.redirect_uri
      ? { state: encodeMobileState(req.query.redirect_uri) }
      : {}),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${APP_URL}/login?error=google`);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${API_URL}/api/auth/google/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    const user = upsertOAuthUser({ provider: 'google', providerId: profile.sub, email: profile.email });
    const token = setSessionCookie(res, user.id);
    const mobileRedirect = decodeMobileState(req.query.state);
    if (mobileRedirect) {
      return res.redirect(`${mobileRedirect}?token=${token}&nickname=${encodeURIComponent(user.nickname || '')}`);
    }
    res.redirect(user.nickname ? APP_URL : `${APP_URL}/nickname`);
  } catch (err) {
    console.error(err);
    const mobileRedirect = decodeMobileState(req.query.state);
    if (mobileRedirect) return res.redirect(`${mobileRedirect}?error=google`);
    res.redirect(`${APP_URL}/login?error=google`);
  }
});

// ---- 카카오 로그인 ----

router.get('/kakao', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY,
    redirect_uri: `${API_URL}/api/auth/kakao/callback`,
    response_type: 'code',
    ...(req.query.platform === 'mobile' && req.query.redirect_uri
      ? { state: encodeMobileState(req.query.redirect_uri) }
      : {}),
  });
  res.redirect(`https://kauth.kakao.com/oauth/authorize?${params}`);
});

router.get('/kakao/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${APP_URL}/login?error=kakao`);

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_REST_API_KEY,
        client_secret: process.env.KAKAO_CLIENT_SECRET || '',
        redirect_uri: `${API_URL}/api/auth/kakao/callback`,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));

    const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.kakao_account?.email || `kakao_${profile.id}@no-email.kakao`;

    const user = upsertOAuthUser({ provider: 'kakao', providerId: String(profile.id), email });
    const token = setSessionCookie(res, user.id);
    const mobileRedirect = decodeMobileState(req.query.state);
    if (mobileRedirect) {
      return res.redirect(`${mobileRedirect}?token=${token}&nickname=${encodeURIComponent(user.nickname || '')}`);
    }
    res.redirect(user.nickname ? APP_URL : `${APP_URL}/nickname`);
  } catch (err) {
    console.error(err);
    const mobileRedirect = decodeMobileState(req.query.state);
    if (mobileRedirect) return res.redirect(`${mobileRedirect}?error=kakao`);
    res.redirect(`${APP_URL}/login?error=kakao`);
  }
});

// ---- 공통 ----

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

router.post('/nickname', requireAuth, (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '닉네임을 입력해주세요' });
  }
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname.trim(), req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: toPublicUser(user) });
});

// 회원탈퇴: 사용자 본체를 지우면 외래키가 연결된 플래너/캘린더/기기/
// 실시간 집중 상태는 ON DELETE CASCADE로 함께 삭제된다. focus_events와
// email_verifications는 users 외래키가 없으므로 트랜잭션 안에서 직접 지운다.
router.delete('/account', requireAuth, (req, res) => {
  if (req.body?.confirmation !== '탈퇴') {
    return res.status(400).json({ error: '회원탈퇴 확인 문구가 올바르지 않아요' });
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM focus_events WHERE user_id = ?').run(req.user.id);
    if (req.user.email) {
      db.prepare('DELETE FROM email_verifications WHERE email = ?').run(req.user.email);
    }
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    if (result.changes !== 1) throw new Error('삭제할 사용자를 찾지 못했어요');
    db.exec('COMMIT');

    res.clearCookie('token');
    res.clearCookie('authToken');
    return res.json({ ok: true });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // BEGIN 이전에 실패했거나 이미 종료된 트랜잭션
    }
    console.error('[auth] 회원탈퇴 실패:', err);
    return res.status(500).json({ error: '회원탈퇴를 처리하지 못했어요' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('authToken');
  res.json({ ok: true });
});

export default router;
