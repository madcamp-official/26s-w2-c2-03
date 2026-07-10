import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth);

function parseRoadmap(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readPlannerData(userId) {
  const tasks = db
    .prepare(`
      SELECT id, type, title, target_minutes, start_time, source_event_id, sort_order, done
      FROM planner_tasks
      WHERE user_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `)
    .all(userId)
    .map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      targetMinutes: row.target_minutes,
      order: row.sort_order,
      done: Boolean(row.done),
      ...(row.start_time ? { startTime: row.start_time } : {}),
      ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    }));

  const events = db
    .prepare(`
      SELECT id, title, event_date, kind, parent_id, roadmap_json
      FROM calendar_events
      WHERE user_id = ?
      ORDER BY event_date ASC, created_at ASC
    `)
    .all(userId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      date: row.event_date,
      kind: row.kind,
      ...(row.parent_id ? { parentId: row.parent_id } : {}),
      ...(row.roadmap_json ? { roadmap: parseRoadmap(row.roadmap_json) } : {}),
    }));

  return { tasks, events };
}

function validateTasks(tasks) {
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
  }
  return null;
}

function validateEvents(events) {
  if (!Array.isArray(events)) return '캘린더 목록 형식이 올바르지 않아요';
  const ids = new Set();
  for (const event of events) {
    if (!event || typeof event.id !== 'string' || !event.id || ids.has(event.id)) {
      return '캘린더 이벤트 ID가 올바르지 않아요';
    }
    ids.add(event.id);
    if (typeof event.title !== 'string' || !event.title.trim()) {
      return '캘린더 이벤트 제목이 올바르지 않아요';
    }
    if (typeof event.date !== 'string' || Number.isNaN(new Date(event.date).getTime())) {
      return '캘린더 이벤트 날짜가 올바르지 않아요';
    }
    if (!['deadline', 'roadmap'].includes(event.kind)) {
      return '캘린더 이벤트 종류가 올바르지 않아요';
    }
  }
  return null;
}

router.get('/', (req, res) => {
  res.json(readPlannerData(req.user.id));
});

router.put('/', (req, res) => {
  const { tasks, events } = req.body;
  const validationError = validateTasks(tasks) || validateEvents(events);
  if (validationError) return res.status(400).json({ error: validationError });

  const insertTask = db.prepare(`
    INSERT INTO planner_tasks
      (id, user_id, type, title, target_minutes, start_time, source_event_id, sort_order, done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO calendar_events
      (id, user_id, title, event_date, kind, parent_id, roadmap_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('DELETE FROM planner_tasks WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM calendar_events WHERE user_id = ?').run(req.user.id);

    tasks.forEach((task, index) => {
      insertTask.run(
        task.id,
        req.user.id,
        task.type,
        task.title,
        task.targetMinutes,
        task.startTime || null,
        task.sourceEventId || null,
        index + 1,
        task.done ? 1 : 0,
      );
    });

    events.forEach((event) => {
      insertEvent.run(
        event.id,
        req.user.id,
        event.title.trim(),
        event.date,
        event.kind,
        event.parentId || null,
        event.roadmap ? JSON.stringify(event.roadmap) : null,
      );
    });

    db.exec('COMMIT');
    res.json(readPlannerData(req.user.id));
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 트랜잭션이 시작되기 전에 실패한 경우에는 롤백할 것이 없다.
    }
    console.error(err);
    res.status(500).json({ error: '플래너 저장에 실패했어요' });
  }
});

export default router;
