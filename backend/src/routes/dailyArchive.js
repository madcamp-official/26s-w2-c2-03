import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);

// 지난 날짜의 "오늘의 계획" 기록 조회 (캘린더에서 지난 날짜 클릭 시 사용)
router.get('/:date', (req, res) => {
  const row = db
    .prepare('SELECT date, tasks_json, archived_at, day_end_time FROM daily_archives WHERE user_id = ? AND date = ?')
    .get(req.user.id, req.params.date);

  if (!row) {
    return res.json({ date: req.params.date, tasks: null, archivedAt: null, dayEndTime: null });
  }

  let tasks = [];
  try {
    tasks = JSON.parse(row.tasks_json);
  } catch {
    tasks = [];
  }
  res.json({ date: row.date, tasks, archivedAt: row.archived_at, dayEndTime: row.day_end_time || null });
});

// 특정 날짜의 할 일 목록을 직접 만들거나 수정한다(캘린더에서 아무 날짜나
// 눌러 그 날의 계획을 편집/추가/삭제할 때 사용). 오늘 날짜의 "라이브"
// 목록(planner_tasks)은 프론트가 따로 관리하므로 여기서는 다루지 않고,
// 과거/미래 날짜의 계획 스냅샷만 저장한다.
function validateArchiveTasks(tasks) {
  if (!Array.isArray(tasks)) return '태스크 목록 형식이 올바르지 않아요';
  const ids = new Set();
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)) {
      return '태스크 ID가 올바르지 않아요';
    }
    ids.add(task.id);
    if (!['task', 'break'].includes(task.type)) return '태스크 종류가 올바르지 않아요';
    if (typeof task.title !== 'string') return '태스크 제목이 올바르지 않아요';
    if (!Number.isInteger(task.targetMinutes) || task.targetMinutes < 1) {
      return '태스크 시간은 1분 이상의 정수여야 해요';
    }
    if (task.startTime != null && !(typeof task.startTime === 'string' && /^\d{2}:\d{2}$/.test(task.startTime))) {
      return '시작 시간 형식이 올바르지 않아요';
    }
  }
  return null;
}

router.put('/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않아요' });
  }
  const { tasks, dayEndTime } = req.body;
  const validationError = validateArchiveTasks(tasks);
  if (validationError) return res.status(400).json({ error: validationError });

  const normalizedDayEndTime = typeof dayEndTime === 'string' && /^\d{2}:\d{2}$/.test(dayEndTime)
    ? dayEndTime
    : null;

  // 태스크를 정규화해서 저장(불필요한 필드 제거, 순서 부여).
  const normalized = tasks.map((t, index) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    targetMinutes: t.targetMinutes,
    done: Boolean(t.done),
    order: index + 1,
    ...(t.startTime ? { startTime: t.startTime } : {}),
    ...(t.sourceEventId ? { sourceEventId: t.sourceEventId } : {}),
  }));

  try {
    db.prepare(`
      INSERT INTO daily_archives (user_id, date, tasks_json, archived_at, day_end_time)
      VALUES (?, ?, ?, datetime('now', 'localtime'), ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        tasks_json = excluded.tasks_json,
        archived_at = excluded.archived_at,
        day_end_time = excluded.day_end_time
    `).run(req.user.id, date, JSON.stringify(normalized), normalizedDayEndTime);

    res.json({ date, tasks: normalized, dayEndTime: normalizedDayEndTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '날짜 계획을 저장하지 못했어요' });
  }
});

// 하루 마무리 시간(+유예시간)이 지나면 프론트에서 호출 — 현재 "오늘의 계획"을
// 해당 날짜의 기록으로 저장하고, 새로운 하루를 시작할 수 있도록 초기화한다.
// tasks는 DB를 다시 읽지 않고 요청 본문으로 직접 받는다 — planner_tasks 저장은
// 350ms 디바운스가 걸려 있어서, 마감 요청이 그보다 먼저 도착하면 DB에서 다시
// 읽을 경우 아직 반영되지 않은(비어 있거나 오래된) 상태를 그대로 아카이빙해
// 버리는 문제가 있었다.
router.post('/close-day', (req, res) => {
  const { date, tasks, dayEndTime } = req.body;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: '날짜 형식이 올바르지 않아요' });
  }
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: '태스크 목록 형식이 올바르지 않아요' });
  }
  // 하루 마무리(마감) 시간 — "HH:MM" 형식만 저장하고, 그 외에는 기록하지 않는다.
  const normalizedDayEndTime = typeof dayEndTime === 'string' && /^\d{2}:\d{2}$/.test(dayEndTime)
    ? dayEndTime
    : null;

  try {
    db.exec('BEGIN IMMEDIATE');

    db.prepare(`
      INSERT INTO daily_archives (user_id, date, tasks_json, archived_at, day_end_time)
      VALUES (?, ?, ?, datetime('now', 'localtime'), ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        tasks_json = excluded.tasks_json,
        archived_at = excluded.archived_at,
        day_end_time = excluded.day_end_time
    `).run(req.user.id, date, JSON.stringify(tasks), normalizedDayEndTime);

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
