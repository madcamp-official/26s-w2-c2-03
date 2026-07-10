import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);

// 지난 날짜의 "오늘의 계획" 기록 조회 (캘린더에서 지난 날짜 클릭 시 사용)
router.get('/:date', (req, res) => {
  const row = db
    .prepare('SELECT date, tasks_json, archived_at FROM daily_archives WHERE user_id = ? AND date = ?')
    .get(req.user.id, req.params.date);

  if (!row) {
    return res.json({ date: req.params.date, tasks: null, archivedAt: null });
  }

  let tasks = [];
  try {
    tasks = JSON.parse(row.tasks_json);
  } catch {
    tasks = [];
  }
  res.json({ date: row.date, tasks, archivedAt: row.archived_at });
});

// 하루 마무리 시간(+유예시간)이 지나면 프론트에서 호출 — 현재 "오늘의 계획"을
// 해당 날짜의 기록으로 저장하고, 새로운 하루를 시작할 수 있도록 초기화한다.
// tasks는 DB를 다시 읽지 않고 요청 본문으로 직접 받는다 — planner_tasks 저장은
// 350ms 디바운스가 걸려 있어서, 마감 요청이 그보다 먼저 도착하면 DB에서 다시
// 읽을 경우 아직 반영되지 않은(비어 있거나 오래된) 상태를 그대로 아카이빙해
// 버리는 문제가 있었다.
router.post('/close-day', (req, res) => {
  const { date, tasks } = req.body;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않아요' });
  }
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: '태스크 목록 형식이 올바르지 않아요' });
  }

  try {
    db.exec('BEGIN IMMEDIATE');

    db.prepare(`
      INSERT INTO daily_archives (user_id, date, tasks_json, archived_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, date) DO UPDATE SET
        tasks_json = excluded.tasks_json,
        archived_at = excluded.archived_at
    `).run(req.user.id, date, JSON.stringify(tasks));

    db.prepare('DELETE FROM planner_tasks WHERE user_id = ?').run(req.user.id);

    db.prepare(`
      INSERT INTO planner_meta (user_id, day_end_time, day_end_date)
      VALUES (?, NULL, NULL)
      ON CONFLICT(user_id) DO UPDATE SET day_end_time = NULL, day_end_date = NULL
    `).run(req.user.id);

    db.exec('COMMIT');
    res.json({ tasks: [] });
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 트랜잭션이 시작되기 전에 실패한 경우에는 롤백할 것이 없다.
    }
    console.error(err);
    res.status(500).json({ error: '하루 마감 처리에 실패했어요' });
  }
});

export default router;
