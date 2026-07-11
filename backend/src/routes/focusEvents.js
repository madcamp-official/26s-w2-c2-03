import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';

const router = Router();

// 지금은 metrics.js와 같은 패턴으로 인증 없이 기기 단위(clientId)로만 기록한다
// — Electron 메인 프로세스는 브라우저 세션 쿠키를 안 갖고 있어서, 나중에
// 로그인 사용자와 제대로 연결하려면 별도의 인증 브릿지가 필요하다. 지금은
// "이후 대시보드를 위해 기록을 남기는 것"이 목적이라 단순하게 간다.
const VALID_TYPES = new Set([
  'session_start',
  'session_end',
  'drift_start',
  'drift_end',
  'alert_shown',
  'alert_action',
  'break_start',
  'break_end',
]);

router.post('/', (req, res) => {
  const { sessionId, clientId, type, meta } = req.body || {};

  if (typeof sessionId !== 'string' || !sessionId) {
    return res.status(400).json({ error: 'sessionId가 필요해요' });
  }
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: '알 수 없는 이벤트 종류예요' });
  }

  try {
    db.prepare(`
      INSERT INTO focus_events (id, session_id, client_id, type, meta_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), sessionId, clientId || null, type, meta ? JSON.stringify(meta) : null);

    res.status(201).json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '집중 이벤트를 저장하지 못했어요' });
  }
});

// 세션 하나의 전체 타임라인 조회 — 나중에 대시보드에서 이 세션의 집중/이탈/
// 휴식 구간을 재구성할 때 쓴다.
router.get('/:sessionId', (req, res) => {
  const rows = db.prepare(`
    SELECT id, type, occurred_at, meta_json
    FROM focus_events
    WHERE session_id = ?
    ORDER BY occurred_at ASC, rowid ASC
  `).all(req.params.sessionId);

  const events = rows.map((row) => ({
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    meta: row.meta_json ? JSON.parse(row.meta_json) : null,
  }));

  res.json({ sessionId: req.params.sessionId, events });
});

export default router;
