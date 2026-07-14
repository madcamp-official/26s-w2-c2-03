import db from '../db.js';
import { verifyToken } from '../services/auth.js';

export function requireAuth(req, res, next) {
  // 데스크톱/웹은 쿠키로, 모바일 앱은 쿠키 지속성이 불안정해서(브라우저가
  // 아니라 앱이라 재시작 시 못 미더움) Authorization 헤더로 같은 JWT를
  // 보낸다 — 둘 다 issueToken()이 만든 같은 형식의 토큰이라 서버는 어디서
  // 왔는지 신경 쓸 필요 없이 그대로 검증하면 된다.
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : null;
  const token = req.cookies?.token || bearer;
  const payload = token && verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: '로그인이 필요해요' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) {
    return res.status(401).json({ error: '로그인이 필요해요' });
  }
  req.user = user;
  next();
}
