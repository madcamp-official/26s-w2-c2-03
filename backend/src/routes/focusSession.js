import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// 이 시간(ms)보다 오래 업데이트가 없으면 "그 기기가 죽었거나 앱이 닫힌 것"
// 으로 보고 idle 취급한다 — 예를 들어 PC가 강제 종료돼서 stop을 못 보낸
// 채로 focusing 상태가 영원히 남는 걸 막는다. 클라이언트가 이 값보다 훨씬
// 짧은 주기(권장 5~10초)로 계속 PUT을 보내는 걸 전제로 한다.
const STALE_MS = 45 * 1000;

function toPublicSession(row) {
  if (!row) return { status: 'idle' };
  // updated_at은 datetime('now','localtime')로 저장한 KST 벽시계 문자열
  // ("2026-07-14 02:55:39")이라 'Z'(UTC)를 붙이면 9시간 오차가 생긴다 —
  // 'T'만 바꿔서 넘기면 Date가 process.env.TZ(Asia/Seoul, server.js에서
  // 고정) 기준 로컬 시각으로 해석해 저장할 때와 같은 기준으로 되돌아온다.
  const updatedAgoMs = Date.now() - new Date(row.updated_at.replace(' ', 'T')).getTime();
  const stale = row.status !== 'idle' && updatedAgoMs > STALE_MS;
  return {
    status: stale ? 'idle' : row.status,
    taskTitle: row.task_title,
    targetMinutes: row.target_minutes,
    source: row.source,
    gauge: row.gauge,
    currentState: row.current_state,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    stale,
  };
}

// 다른 기기(들)가 "지금 이 계정이 뭘 하고 있는지" 보려고 폴링한다.
router.get('/', (req, res) => {
  const row = db.prepare('SELECT * FROM focus_live_sessions WHERE user_id = ?').get(req.user.id);
  res.json({ session: toPublicSession(row) });
});

// 집중/휴식 상태가 바뀔 때마다(또는 주기적으로) 자기 상태를 밀어 넣는다.
// 데스크톱은 pollFocus tick마다, 모바일은 수동 타이머 시작/틱마다 호출.
router.put('/', (req, res) => {
  const { status, taskTitle, targetMinutes, source, gauge, currentState, startedAt } = req.body || {};
  if (!['idle', 'focusing', 'onBreak'].includes(status)) {
    return res.status(400).json({ error: 'status가 올바르지 않아요' });
  }

  db.prepare(`
    INSERT INTO focus_live_sessions (user_id, status, task_title, target_minutes, source, gauge, current_state, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status, task_title = excluded.task_title, target_minutes = excluded.target_minutes,
      source = excluded.source, gauge = excluded.gauge, current_state = excluded.current_state,
      started_at = excluded.started_at, updated_at = excluded.updated_at
  `).run(
    req.user.id, status, taskTitle || null, Number.isFinite(targetMinutes) ? targetMinutes : null,
    source || null, Number.isFinite(gauge) ? gauge : null, currentState || null, startedAt || null,
  );

  res.json({ ok: true });
});

// 집중을 멈출 때 명시적으로 idle로 되돌린다(다음 폴링에서 바로 반영되게 —
// STALE_MS까지 기다리지 않아도 된다).
router.post('/stop', (req, res) => {
  db.prepare(`
    INSERT INTO focus_live_sessions (user_id, status, updated_at)
    VALUES (?, 'idle', datetime('now', 'localtime'))
    ON CONFLICT(user_id) DO UPDATE SET status = 'idle', updated_at = datetime('now', 'localtime')
  `).run(req.user.id);
  res.json({ ok: true });
});

export default router;
