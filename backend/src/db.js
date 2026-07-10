import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

// better-sqlite3는 이 Node 버전에서 네이티브 빌드가 실패해서, Node 22+ 내장
// node:sqlite(DatabaseSync)로 대체 — 별도 컴파일 없이 Node 자체에 포함됨
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'data.sqlite'));

db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    provider TEXT NOT NULL,
    provider_id TEXT,
    nickname TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS planner_tasks (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('task', 'break')),
    title TEXT NOT NULL,
    target_minutes INTEGER NOT NULL,
    start_time TEXT,
    source_event_id TEXT,
    sort_order INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deadline', 'roadmap')),
    parent_id TEXT,
    roadmap_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_planner_tasks_user_order
    ON planner_tasks(user_id, sort_order);

  CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
    ON calendar_events(user_id, event_date);
`);

// planner_tasks에 start_time/source_event_id 컬럼을 나중에 추가했다 —
// CREATE TABLE IF NOT EXISTS는 이미 만들어진 테이블에는 영향을 주지 않으므로,
// 기존 DB 파일에는 별도로 ALTER TABLE을 시도한다. 컬럼이 이미 있으면 에러를
// 무시한다.
for (const column of ['start_time TEXT', 'source_event_id TEXT']) {
  try {
    db.exec(`ALTER TABLE planner_tasks ADD COLUMN ${column}`);
  } catch {
    // 컬럼이 이미 존재하는 경우
  }
}

export default db;
