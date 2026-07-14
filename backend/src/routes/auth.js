import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { sendVerificationCode } from '../services/email.js';
import { hashPassword, verifyPassword, issueToken } from '../services/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const CODE_TTL_MIN = 10;
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

// ---- 이메일 회원가입 (이메일/비번/비번확인 입력 -> 인증코드 발송 -> 코드 확인 시 계정 생성) ----

router.post('/email/send-code', async (req, res) => {
  const { email, password, passwordConfirm } = req.body;

  if (!email || !password || !passwordConfirm) {
    return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요' });
  }
  if (password !== passwordConfirm) {
    return res.status(400).json({ error: '비밀번호가 서로 달라요' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: '이미 가입된 이메일이에요' });
  }

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO email_verifications (email, code, password_hash, expires_at, attempts)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET
       code = excluded.code, password_hash = excluded.password_hash,
       expires_at = excluded.expires_at, attempts = 0`
  ).run(email, code, hashPassword(password), expiresAt);

  let result;
  try {
    result = await sendVerificationCode(email, code);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '인증 메일 전송에 실패했어요. 잠시 후 다시 시도해주세요.' });
  }

  // 이메일 provider 미설정(개발 모드)일 때만 devCode를 내려줘서 화면에서
  // 바로 진행할 수 있게 한다. 실제 발송된 경우에는 코드를 노출하지 않는다.
  const body = { ok: true };
  if (result && result.delivered === false) body.devCode = result.devCode;
  res.json(body);
});

router.post('/email/verify', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: '인증번호를 입력해주세요' });
  }

  const pending = db.prepare('SELECT * FROM email_verifications WHERE email = ?').get(email);
  if (!pending) {
    return res.status(400).json({ error: '인증 요청을 먼저 해주세요' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    return res.status(400).json({ error: '인증번호가 만료됐어요. 다시 받아주세요' });
  }
  if (pending.attempts >= 5) {
    return res.status(429).json({ error: '시도 횟수를 초과했어요. 다시 받아주세요' });
  }
  if (pending.code !== code) {
    db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?').run(email);
    return res.status(400).json({ error: '인증번호가 일치하지 않아요' });
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, provider, email_verified) VALUES (?, ?, ?, 'email', 1)`
  ).run(id, email, pending.password_hash);
  db.prepare('DELETE FROM email_verifications WHERE email = ?').run(email);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  // 쿠키(웹/데스크톱)에 더해 토큰을 응답 본문에도 실어준다 — 모바일 앱은
  // 쿠키 대신 이 값을 저장했다가 Authorization 헤더로 보낸다.
  const token = setSessionCookie(res, user.id);
  res.json({ user: toPublicUser(user), token });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않아요' });
  }
  const token = setSessionCookie(res, user.id);
  res.json({ user: toPublicUser(user), token });
});

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

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('authToken');
  res.json({ ok: true });
});

export default router;
