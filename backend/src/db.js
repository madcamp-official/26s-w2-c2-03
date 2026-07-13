import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

// better-sqlite3는 이 Node 버전에서 네이티브 빌드가 실패해서, Node 22+ 내장
// node:sqlite(DatabaseSync)로 대체 — 별도 컴파일 없이 Node 자체에 포함됨
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB 파일 위치. 패키징된 앱에서는 Electron이 DATA_DIR로 userData 경로
// (~/Library/Application Support/Zonemate 등)를 넘겨준다 — 이 경로는 앱을
// 업데이트(재설치)해도 유지되므로 로그인·닉네임·플래너 데이터가 보존된다.
// 예전엔 __dirname 기준(앱 번들 안)에 저장해서, 업데이트할 때마다 번들이
// 통째로 교체되며 DB가 사라져 매번 초기화되는 버그가 있었다(2026-07-13 수정).
// 개발 모드에서는 DATA_DIR이 없어 기존처럼 backend/data.sqlite에 저장한다.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
const db = new DatabaseSync(path.join(dataDir, 'data.sqlite'));

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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS daily_archives (
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    tasks_json TEXT NOT NULL,
    archived_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS planner_meta (
    user_id TEXT PRIMARY KEY,
    day_end_time TEXT,
    day_end_date TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS focus_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    client_id TEXT,
    type TEXT NOT NULL,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    meta_json TEXT
  );

  -- 기기 연동: PC에서 발급한 짧은 코드를 폰이 입력해서 같은 계정에 기기로
  -- 등록한다. 코드는 3분 뒤 만료되고 한 번 쓰면 재사용 불가.
  CREATE TABLE IF NOT EXISTS pairing_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT, -- 'ios' | 'android' | 'desktop-mac' | 'desktop-windows' 등
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_planner_tasks_user_order
    ON planner_tasks(user_id, sort_order);

  CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
    ON calendar_events(user_id, event_date);

  CREATE INDEX IF NOT EXISTS idx_focus_events_session
    ON focus_events(session_id, occurred_at);

  CREATE INDEX IF NOT EXISTS idx_pairing_codes_user
    ON pairing_codes(user_id);

  CREATE INDEX IF NOT EXISTS idx_devices_user
    ON devices(user_id);
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

// daily_archives에 그날의 하루 마무리(마감) 시간을 함께 기록하려고 나중에
// 추가한 컬럼. 위와 같은 이유로 기존 DB에는 ALTER로 채운다.
try {
  db.exec('ALTER TABLE daily_archives ADD COLUMN day_end_time TEXT');
} catch {
  // 컬럼이 이미 존재하는 경우
}

export default db;
