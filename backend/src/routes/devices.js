import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

const PAIRING_CODE_TTL_MIN = 3;

function toPublicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    createdAt: device.created_at,
    lastSeenAt: device.last_seen_at,
  };
}

// PC(이미 로그인된 브라우저/데스크톱 앱)에서 "기기 연동" 시작 — 3분짜리
// 1회용 코드를 발급한다. 코드 자체엔 아무 정보도 없고, 검증할 때 이
// user_id로 그 계정에 기기를 등록한다.
router.post('/pairing-code', (req, res) => {
  // 오래된 미사용 코드가 쌓이지 않도록, 발급 시점에 이 계정의 만료된
  // 코드를 같이 정리한다.
  db.prepare(`DELETE FROM pairing_codes WHERE user_id = ? AND (used = 1 OR expires_at < datetime('now', 'localtime'))`)
    .run(req.user.id);

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MIN * 60 * 1000).toISOString();
  db.prepare('INSERT INTO pairing_codes (code, user_id, expires_at) VALUES (?, ?, ?)')
    .run(code, req.user.id, expiresAt);

  res.json({ code, expiresInSec: PAIRING_CODE_TTL_MIN * 60 });
});

// 모바일(자기 계정으로 이미 로그인된 상태)에서 PC 화면에 뜬 코드를 입력 —
// 코드가 "같은 계정" 소유일 때만 통과시켜서, 남의 코드를 잘못 입력해도
// 다른 계정에 기기가 잘못 연동되지 않게 한다.
router.post('/pair', (req, res) => {
  const { code, name, platform } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: '코드와 기기 이름을 입력해주세요' });
  }

  const pending = db.prepare('SELECT * FROM pairing_codes WHERE code = ?').get(code);
  if (!pending || pending.used || pending.user_id !== req.user.id) {
    return res.status(400).json({ error: '코드가 올바르지 않아요' });
  }
  if (new Date(pending.expires_at) < new Date()) {
    return res.status(400).json({ error: '코드가 만료됐어요. PC에서 다시 발급받아주세요' });
  }

  db.prepare('UPDATE pairing_codes SET used = 1 WHERE code = ?').run(code);

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO devices (id, user_id, name, platform) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, name.trim().slice(0, 40), platform || null);

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  res.json({ device: toPublicDevice(device) });
});

router.get('/', (req, res) => {
  const devices = db
    .prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.user.id);
  res.json({ devices: devices.map(toPublicDevice) });
});

router.patch('/:id', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '이름을 입력해주세요' });
  }
  const result = db
    .prepare('UPDATE devices SET name = ? WHERE id = ? AND user_id = ?')
    .run(name.trim().slice(0, 40), req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: '기기를 찾을 수 없어요' });
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  res.json({ device: toPublicDevice(device) });
});

router.delete('/:id', (req, res) => {
  const result = db
    .prepare('DELETE FROM devices WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: '기기를 찾을 수 없어요' });
  res.json({ ok: true });
});

export default router;
