import db from '../db.js';
import { verifyToken } from '../services/auth.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
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
