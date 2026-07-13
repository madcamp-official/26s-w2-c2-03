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
  'overfocus_alert',
  'underfocus_alert',
  'gauge_low_alert',
  'break_start',
  'break_end',
]);

function parseMeta(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

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

// 특정 날짜에 시작한 집중 세션들의 요약 — 캘린더에서 그 날짜를 눌렀을 때
// "여태까지 집중했던 로그"를 보여주는 데 쓴다. (occurred_at은 UTC로 저장되므로
// 로컬 날짜 기준으로 묶으려고 date(...,'localtime')을 쓴다.)
// 주의: 이 라우트는 '/:sessionId'보다 먼저 정의해야 'day'가 sessionId로
// 잡히지 않는다.
router.get('/day/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않아요' });
  }

  const starts = db.prepare(`
    SELECT session_id, occurred_at, meta_json
    FROM focus_events
    WHERE type = 'session_start' AND date(occurred_at, 'localtime') = ?
    ORDER BY occurred_at ASC
  `).all(date);

  const endStmt = db.prepare(`
    SELECT occurred_at, meta_json FROM focus_events
    WHERE session_id = ? AND type = 'session_end'
    ORDER BY occurred_at DESC LIMIT 1
  `);
  const driftStmt = db.prepare(`
    SELECT COUNT(*) AS c FROM focus_events WHERE session_id = ? AND type = 'drift_start'
  `);

  const sessions = starts.map((start) => {
    const startMeta = parseMeta(start.meta_json) || {};
    const endRow = endStmt.get(start.session_id);
    const endMeta = endRow ? parseMeta(endRow.meta_json) || {} : null;
    const driftCount = endMeta?.driftCount ?? driftStmt.get(start.session_id).c;

    // focusApps는 예전엔 객체 배열({name,bundleId,...}), 지금은 이름 배열로
    // 저장돼 있다. 둘 다 이름 문자열 배열로 정규화한다.
    const focusApps = (Array.isArray(startMeta.focusApps) ? startMeta.focusApps : [])
      .map((a) => (typeof a === 'string' ? a : a?.name || ''))
      .filter(Boolean);

    return {
      sessionId: start.session_id,
      startedAt: start.occurred_at,
      endedAt: endRow?.occurred_at || null,
      completed: Boolean(endRow),
      taskTitle: startMeta.taskTitle || null,
      targetMinutes: startMeta.targetMinutes ?? null,
      focusApps,
      totalFocusMs: endMeta?.totalFocusMs ?? null,
      totalDriftMs: endMeta?.totalDriftMs ?? null,
      totalBreakMs: endMeta?.totalBreakMs ?? null,
      driftCount,
    };
  });

  res.json({ date, sessions });
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
