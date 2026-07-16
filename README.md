# 26s-w2-c2-03

## 공통과제 II : 협업형 실전 산출물 제작 (2인 1팀)

**목적:** 실시간 인터랙션, LLM Wrapper, Cross-Platform 중 하나의 옵션을 선택해 구현하며, 선택한 기술을 실제로 동작하는 형태의 산출물로 완성한다.

**선택 옵션:**

| 옵션 | 설명 |
|---|---|
| 실시간 인터랙션 | 사용자 간 상태 변화, 실시간 데이터 흐름, 스트리밍 응답 등 실시간성이 드러나는 기능을 구현 |
| LLM Wrapper | LLM API를 활용하여 AI 기능이 포함된 산출물을 구현 |
| Cross-Platform | 하나의 산출물을 여러 실행 환경에서 사용할 수 있도록 구현* |

> *데스크톱 앱 ↔ 모바일 앱; 혹은 다른 폼팩터에서의 앱; 웹만/웹 기반 프레임워크(Electron, Tauri 등) 대신 다른 프레임워크를 시도해보는 것을 적극 권장

**결과물:** 선택한 옵션이 적용된 작동 가능한 산출물, 실행 가능한 코드, 시연 자료 및 관련 문서

---

## 팀원

| 이름 | 학교 | GitHub | 역할 |
|---|---|---|---|
| 김민재 | UNIST | Kminj2296 | 프론트엔드 |
| 이예지 | KAIST | yeochi369 | 백엔드 |

---

## 선택 옵션

- [x] 실시간 인터랙션 — 데스크톱의 실시간 집중 게이지, PC↔모바일 집중 세션 양방향 미러링(HTTP 폴링)
- [x] LLM Wrapper — Gemini로 오늘 할 일 대화형 계획 분해 · 마감 태스크 로드맵 생성 · 브라우저 탭 관련성 판정
- [x] Cross-Platform — 하나의 백엔드에 웹 · Electron 데스크톱(mac/Win) · Expo 모바일(iOS/Android) · Chrome 확장이 계정 기준으로 붙음

---

## 기획안

- **산출물 주제:** **Zonemate** — ADHD 성향 사용자를 위한 집중 관리 서비스. 데스크톱은 마우스/키보드 활동과 활성 창으로 집중 상태를 실시간 파악하고, "오늘 할 일"을 AI(John)와의 대화로 체크리스트로 쪼갠다. 웹·데스크톱·모바일·브라우저 확장이 한 계정으로 이어진다(웹캠 미사용).
- **제작 목적:** ADHD는 "집중을 못하는 것"이 아니라 "집중의 방향 전환을 스스로 조절하지 못하는 것"에 가깝다. 실패 모드는 두 가지 — 이탈(딴짓)과 과몰입(오버드라이브, 번아웃) — 인데 기존 툴은 대부분 전자만, 그것도 위로/칭찬 위주로 다룬다. 이 서비스는 판단 없는 팩트 기반 피드백으로 두 실패 모드 모두를 감지하고 개입한다.
- **선택 옵션:** 실시간 인터랙션(실시간 집중 게이지 · PC↔모바일 미러링 · 팩트 기반 알림) + LLM Wrapper(대화형 계획 분해 · 마감 로드맵 · 탭 관련성 판정) + Cross-Platform(웹/데스크톱/모바일/확장)
- **핵심 구현 요소:**
  - 데스크톱: `get-windows` 기반 실시간 집중 게이지(키/마우스 활동), 이탈·과몰입·집중저하 감지, 팩트 기반 플로팅 알림, 브라우저 확장으로 "허용 앱의 무관한 탭"까지 이탈 판정
  - LLM(Gemini): 대화형 "오늘의 계획" 분해(John), 마감 태스크 → 로드맵 생성, 탭 관련성 판정
  - 크로스플랫폼: 계정 기준 데이터 공유, PC↔모바일 집중 세션 양방향 미러링, 기기 연동(코드 페어링), 하루 마감 시 캘린더 아카이브
- **사용 / 시연 시나리오:** "오늘 할 일"·"마감 태스크"를 입력 → LLM이 체크리스트/로드맵으로 분해 → 데스크톱에서 집중 시작 시 실시간 게이지·이탈/과몰입 알림, 그 상태가 모바일에도 미러링 → 하루 마무리 시간이 지나면 그날 계획이 캘린더에 기록되고 메인에서 사라짐 → 캘린더에서 지난 집중 세션 그래프 확인
- **팀원별 역할:** 김민재(프론트엔드 — 웹 React UI, Electron 데스크톱, Expo 모바일, 브라우저 확장, 릴리즈/배포), 이예지(백엔드 — LLM 프롬프트, 집중 스코어링, 활성창/입력 트래킹, `node:sqlite`)

### 개발 일정

| 날짜 | 목표 |
|---|---|
| Day 1 | 플래너 웹앱 프로토타입 (할일 입력 → LLM 퀘스트 분해), macOS 권한 프롬프트 별도 확인 |
| Day 2 | 캐스케이딩 데드라인 + 퀘스트 완료 피드백 — 순수 LLM Wrapper 데모로 발표 가능한 수준 |
| Day 3 | Electron 이전, uiohook-napi / active-win / SQLite 세팅 |
| Day 4 | 백그라운드 모니터링 (키보드/마우스 1분 단위 집계, 활성 창 카테고리 분류 룰) |
| Day 5 | 집중 스코어(EMA) + 팩트 기반 알림, 인앱 AI 채팅 패널 추가 |
| Day 6 | 과몰입(연속 몰입시간) 감지 + 퀘스트 데드라인 연동 통합, 모바일 버전 구현 |
| Day 7 | UX 카피 톤 정리, 대시보드/공유카드, 데모 리허설 |

---

## 구현 명세서 (현재 구현 상태)

| 구현 요소 | 설명 | 상태 |
|---|---|---|
| 회원가입/로그인 | 이메일(비번+인증코드) 또는 구글/카카오 OAuth, 최초 로그인 시 닉네임. 웹/데스크톱 쿠키 + 모바일 Bearer | ✅ |
| 오늘의 계획(대화형 분해) | John과 대화 → Gemini가 휴식 포함 체크리스트 + 시작/마무리 시각 생성 | ✅ |
| 마감 태스크 → 캘린더/로드맵 | 마감 입력 → 캘린더 이벤트 + 로드맵 생성, 단계별 캘린더 등록 선택 | ✅ |
| 실시간 집중 세션(데스크톱) | `get-windows`로 활성 창 추적, 집중력 게이지, 이탈/과몰입/집중저하 감지, 팩트 기반 플로팅 알림 | ✅ |
| 탭 관련성 판정 | Chrome 확장이 활성 탭 보고 → LLM이 "허용 앱이지만 무관한 탭"을 이탈로 판정 | ✅ |
| PC↔모바일 미러링 | 한쪽이 집중 시작하면 양쪽이 함께 집중 모드로, 어느 쪽에서 종료해도 같이 종료 | ✅ |
| 기기 연동 | PC에서 3분 코드 발급 → 폰에서 입력해 같은 계정 기기로 등록 | ✅ |
| 하루 마감 → 캘린더 아카이브 | 마무리 시각+유예 후 그날 계획을 아카이브하고 메인에서 초기화, 캘린더에서 열람 | ✅ |
| 집중 그래프/기록 | 캘린더 날짜별 집중 세션의 게이지 곡선·통계 표시(데스크톱 추적분) | ✅ |
| iOS 앱 차단(Forest식) | Screen Time으로 집중 중 선택 앱 차단 — 네이티브 모듈 완성, 유료 계정+빌드 미완으로 보류 | ✅ |

---

## 아키텍처

하나의 백엔드(계정 기준으로 모든 데이터 공유)에 **4개의 클라이언트**가 붙는 크로스플랫폼 구조. 서비스명은 **Zonemate**.

```
[Chrome 확장] --활성 탭 보고-->  ┌──────────────────────────┐
[Electron 데스크톱(mac/Win)] --> │  Backend (Express +      │
[Expo 모바일(iOS/Android)]  <--> │  node:sqlite) @ Railway  │
[웹 프론트(React)] ------------> │  + 빌드된 웹 프론트 서빙  │
                                 └──────────────────────────┘
```

- **백엔드** (`backend/`): Express + `node:sqlite`, Railway 호스팅. 인증·플래너·캘린더·집중 세션/이벤트·기기 연동 API와 Gemini 호출을 담당하고, 빌드된 웹 프론트도 같은 오리진에서 서빙한다. 모든 시간은 `TZ=Asia/Seoul` 고정.
- **웹 프론트** (`frontend/`): React(Vite) + react-router. 로그인 / 오늘의 계획 / 캘린더 UI. 빌드 결과물을 백엔드가 서빙.
- **데스크톱 앱** (`electron/`): Electron. 패키징본은 Railway의 웹 프론트를 그대로 로드하므로 **프론트 수정은 Railway 재배포만으로 데스크톱에 반영**된다. 메인 프로세스가 `get-windows`로 활성 창을 추적해 실시간 집중 세션(키/마우스 활동 기반 집중력 게이지, 이탈·과몰입·집중저하 감지, 팩트 기반 알림)을 돌린다. GitHub Actions로 mac/Windows 설치본을 태그 push 시 자동 릴리즈(update.electronjs.org 자동 업데이트).
- **모바일 앱** (`mobile/`): Expo/React Native. 오늘의 계획 / 캘린더 / 집중 모드를 제공. 웹·데스크톱은 쿠키 세션이지만 모바일은 같은 JWT를 `Authorization: Bearer` 헤더로 보낸다.
- **브라우저 확장** (`browser-extension/`): Chrome MV3. 활성 탭 URL/제목을 백엔드에 보고해, 데스크톱 집중 세션이 "허용한 앱이지만 지금 보는 탭은 작업과 무관"한 경우까지 이탈로 판정하게 돕는다.

**인증:** 이메일(비번+인증코드) 또는 구글/카카오 OAuth. 세션은 JWT — 웹/데스크톱은 httpOnly 쿠키(+ Electron 메인 프로세스에 넘겨줄 non-httpOnly `authToken` 쿠키), 모바일은 응답 본문의 토큰을 SecureStore에 저장해 Bearer 헤더로 사용한다. OAuth는 백엔드가 authorize/callback을 직접 처리(passport 없이)하며, 모바일은 콜백 redirect_uri를 `state`에 실어 딥링크(`exp://...` 또는 `zonemate://`)로 토큰을 돌려받는다. 로그인 직후 닉네임이 없으면 `/nickname`으로 유도.

**실시간 미러링:** PC/폰 중 한쪽이 집중을 시작하면 `focus_live_sessions`(계정당 1행)에 자기 상태를 주기적으로(≈5초) 써두고, 다른 기기가 폴링해 "지금 집중 중"을 따라 보여준다. 양방향이며 WebSocket이 아닌 **HTTP 폴링** 방식(Railway 환경에서 단순·견고하게).

---

## 설계 문서

> 프로젝트 성격에 따라 필요한 항목만 작성

### 화면 / 인터페이스 설계

"앰버 인광 계기판" 디자인 시스템 사용 (라이트모드 고정). 시그널(집중, 앰버)과 노이즈(이탈, 블루그레이) 두 축으로 색을 나누고, 경고색(urgent)은 실제 마감 임박에만 사용. 데이터/숫자는 모노스페이스, 문장은 시스템 산세리프로 구분. 상세 토큰은 `frontend/src/styles/tokens.css` 참고.

캘린더(03)는 월간 그리드 뷰로 표시되며, 이벤트는 날짜 칸 위의 작은 색상 띠(칩)로 나타남. 칩을 드래그해서 다른 날짜로 옮길 수 있고(시간은 유지), 클릭하면 제목·날짜·시간을 수정하거나 삭제할 수 있는 패널이 열림.

### 데이터 구조 (DB 스키마)

SQLite(`node:sqlite` 내장, 파일: `backend/data.sqlite` 또는 `DATA_DIR/data.sqlite`, gitignore됨). 모든 사용자 데이터 테이블은 `user_id`로 계정별 격리되고 `ON DELETE CASCADE`로 계정 삭제 시 함께 지워진다.

| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `users` | `id` PK, `email` UNIQUE, `password_hash?`, `provider`('email'\|'google'\|'kakao'), `provider_id?`, `nickname?`, `email_verified`, `created_at` | 계정 |
| `email_verifications` | `email` PK, `code`, `password_hash`, `expires_at`, `attempts` | 이메일 가입 인증코드 임시 테이블(확인 성공 시 users로 이동 후 삭제) |
| `planner_tasks` | `(user_id, id)` PK, `type`('task'\|'break'), `title`, `target_minutes`, `start_time?`, `source_event_id?`, `sort_order`, `done`, `created_at`, `updated_at` | "오늘의 계획" 라이브 체크리스트 |
| `calendar_events` | `(user_id, id)` PK, `title`, `event_date`, `kind`('deadline'\|'roadmap'), `parent_id?`, `roadmap_json?` | 캘린더 이벤트(마감/로드맵) |
| `daily_archives` | `(user_id, date)` PK, `tasks_json`, `archived_at`, `day_end_time?` | 하루 마감 시 그날 "오늘의 계획" 스냅샷 |
| `planner_meta` | `user_id` PK, `day_end_time?`, `day_end_date?` | 하루 마무리(마감) 시각 설정 |
| `focus_events` | `id` PK, `session_id`, `user_id?`, `client_id?`, `type`, `occurred_at`, `meta_json?` | 집중 세션 이벤트 로그(session_start/end, drift, overfocus 등) — 캘린더 집중 그래프의 원천 |
| `pairing_codes` | `code` PK, `user_id`, `expires_at`, `used`, `created_at` | 기기 연동용 3분 1회용 코드 |
| `devices` | `id` PK, `user_id`, `name`, `platform?`, `created_at`, `last_seen_at` | 계정에 연동된 기기 목록 |
| `focus_live_sessions` | `user_id` PK, `status`('idle'\|'focusing'\|'onBreak'), `task_title?`, `target_minutes?`, `source`('desktop'\|'mobile'), `gauge?`, `current_state?`, `started_at?`, `updated_at` | 실시간 미러링용 계정당 현재 집중 상태(1행) |

프론트에서 다루는 도메인 객체 형태:
- 계획 항목: `{ id, type: 'task'|'break', title, targetMinutes, order, done, startTime?, sourceEventId? }`
- 캘린더 이벤트: `{ id, title, date, kind: 'deadline'|'roadmap', parentId?, roadmap? }`

### API 명세

베이스: `https://26s-w2-c2-03-production.up.railway.app` (개발 시 `http://localhost:4000`). 인증이 필요한 엔드포인트는 **쿠키(웹/데스크톱)** 또는 **`Authorization: Bearer <token>`(모바일)** 중 하나를 받는다. 로그인/인증 응답은 `{ user, token }`을 함께 준다(모바일이 token을 저장).

**인증 — `/api/auth`**

| Method | Endpoint | 설명 | 요청 | 응답 |
|---|---|---|---|---|
| POST | `/email/send-code` | 이메일/비번 검증 후 인증코드 발송 | `{ email, password, passwordConfirm }` | `{ ok, devCode? }` |
| POST | `/email/verify` | 인증코드 확인 → 계정 생성 + 세션 | `{ email, code }` | `{ user, token }` |
| POST | `/login` | 이메일/비번 로그인 | `{ email, password }` | `{ user, token }` |
| GET | `/google`, `/kakao` | OAuth 시작(302). 모바일은 `?platform=mobile&redirect_uri=` | - | 302 |
| GET | `/google/callback`, `/kakao/callback` | OAuth 콜백 → 계정 upsert + 세션, 웹은 `/`·`/nickname`, 모바일은 딥링크로 302 | - | 302 |
| GET | `/me` 🔒 | 현재 세션 사용자 | - | `{ user }` |
| POST | `/nickname` 🔒 | 닉네임 설정 | `{ nickname }` | `{ user }` |
| DELETE | `/account` 🔒 | 계정 삭제 | - | `{ ok }` |
| POST | `/logout` | 로그아웃(쿠키 삭제) | - | `{ ok }` |

**플래너 / 캘린더 — `/api/planner-data`, `/api/daily-archives`** (모두 🔒)

| Method | Endpoint | 설명 | 요청 → 응답 |
|---|---|---|---|
| GET | `/api/planner-data` | 오늘의 계획·캘린더·마감시각 조회 | → `{ tasks, events, dayEndTime, dayEndDate }` |
| PUT | `/api/planner-data` | 위 전체 저장(덮어쓰기) | `{ tasks, events, dayEndTime, dayEndDate }` → 같은 형태 |
| GET | `/api/daily-archives/:date` | 그 날짜 아카이브 조회 | → `{ date, tasks, archivedAt, dayEndTime }` (없으면 `tasks:null`) |
| PUT | `/api/daily-archives/:date` | 특정 날짜 계획 스냅샷 저장 | `{ tasks, dayEndTime }` |
| POST | `/api/daily-archives/close-day` | 하루 마감: 아카이브 저장 + 오늘의 계획 초기화 | `{ date, tasks, dayEndTime }` → `{ tasks: [] }` |

**LLM — `/api/plan`, `/api/deadline-tasks`** (내부적으로 Gemini 호출)

| Method | Endpoint | 설명 | 요청 → 응답 |
|---|---|---|---|
| POST | `/api/plan` | "오늘 할 일" 대화형 계획 분해(John) | `{ messages, forceFinalize }` → `{ done, items?/question?, dayEndTime? }` |
| POST | `/api/deadline-tasks` | 마감 태스크 → 이벤트명 + 로드맵 | `{ title, details, deadline }` → `{ eventName, roadmap }` |

**실시간 집중 — `/api/focus-session`, `/api/focus-events`, `/api/metrics`**

| Method | Endpoint | 설명 | 요청 → 응답 |
|---|---|---|---|
| GET | `/api/focus-session` 🔒 | 계정의 현재 실시간 집중 상태(미러링) | → `{ session }` |
| PUT | `/api/focus-session` 🔒 | 내 집중 상태 밀어넣기 | `{ status, taskTitle, targetMinutes, source, gauge, currentState, startedAt }` → `{ ok }` |
| POST | `/api/focus-session/stop` 🔒 | 집중 상태를 idle로 | → `{ ok }` |
| POST | `/api/focus-events` 🔒 | 집중 이벤트 기록(session_start/end, drift 등) | `{ sessionId, clientId, type, meta }` |
| GET | `/api/focus-events/day/:date` 🔒 | 그 날의 집중 세션(통계·timeline 포함) | → `{ date, sessions:[...] }` |
| GET | `/api/focus-events/:sessionId` 🔒 | 세션 하나 상세 | → 세션 객체 |
| GET | `/api/metrics/focus-state` | 데스크톱 입력 트래커 상태 폴링 | → `{ sessions }` |
| POST | `/api/metrics/classify-page` | 현재 탭이 작업과 관련 있는지 LLM 판정 | `{ url, title, windowTitle, taskTitle }` → `{ classification }` |

**기기 연동 — `/api/devices`** (모두 🔒)

| Method | Endpoint | 설명 | 요청 → 응답 |
|---|---|---|---|
| POST | `/api/devices/pairing-code` | 3분 1회용 연동 코드 발급(PC에서) | → `{ code, expiresInSec }` |
| POST | `/api/devices/pair` | 코드 입력해 같은 계정에 기기 등록(폰에서) | `{ code, name, platform }` → `{ device }` |
| GET | `/api/devices` | 연동된 기기 목록 | → `{ devices }` |
| PATCH | `/api/devices/:id` | 기기 이름 변경 | `{ name }` |
| DELETE | `/api/devices/:id` | 기기 연동 해제 | → `{ ok }` |

> 🔒 = 인증 필요. 그 외 외부 서비스: **Google Gemini**(계획/로드맵/탭 판정), **Google·Kakao OAuth**, **Resend**(이메일 인증). 헬스체크: `GET /api/health` → `{ ok: true }`.

---

## 산출물 및 실행 방법

- **산출물 설명:** **Zonemate** — 계정 하나로 웹·데스크톱(mac/Win)·모바일(iOS/Android)·Chrome 확장에서 쓰는 집중 관리 서비스. 오늘 할 일/마감 태스크를 LLM이 계획으로 분해하고, 데스크톱은 실시간으로 집중 상태를 추적하며, PC↔모바일 집중이 양방향 미러링된다.
- **실행 환경:** 백엔드/웹은 **Node.js 22+**(node:sqlite). 데스크톱 빌드는 Electron + macOS/Windows, 모바일은 Expo(개발 빌드 필요 기능은 iOS 16+). Gemini API 키 필요. 소셜로그인/이메일인증은 구글·카카오 자격증명·Resend 키 필요(없어도 이메일 없는 나머지 기능은 동작).
- **배포:** 백엔드+웹은 **Railway**(git push 시 `backend/**`·`frontend/**` 변경 자동 배포), 데스크톱은 **GitHub Actions**로 태그(`v*`) push 시 mac/Windows 설치본 자동 릴리즈.

### 실행 방법 (개발)

```bash
# 백엔드
cd backend
cp .env.example .env   # GEMINI_API_KEY 등 입력 (.env.example 주석 참고)
npm install
npm run dev             # http://localhost:4000

# 웹 프론트 (새 터미널)
cd frontend
npm install
npm run dev             # http://localhost:5173

# 데스크톱 앱 (backend/frontend 실행 상태에서)
cd electron
npm install
npm start               # 개발 모드: localhost 백엔드/프론트를 감싼다

# 모바일 앱 (Expo)
cd mobile
npm install
npx expo start          # Expo Go로 QR 스캔 (앱 차단 등 네이티브 기능은 개발 빌드 필요)
```

> 데스크톱 릴리즈: `electron/package.json`의 version을 올리고 `git tag vX.Y.Z && git push origin vX.Y.Z` → GitHub Actions가 mac(arm64)+Windows(x64) 설치본을 자동 발행.

### 기술 구성

| 분류 | 사용 기술 |
|---|---|
| 웹 프론트 | React (Vite), react-router-dom, react-native-svg(집중 그래프는 모바일) |
| 데스크톱 | Electron, `get-windows`(활성 창 추적), electron-forge(squirrel/dmg), update-electron-app |
| 모바일 | Expo / React Native, React Navigation, expo-secure-store, expo-web-browser/linking |
| 브라우저 확장 | Chrome MV3 (활성 탭 보고) |
| 백엔드 | Express, `node:sqlite`(Node 내장; better-sqlite3 네이티브 빌드 회피), cookie-parser, cors, dotenv |
| 인증 | JWT (httpOnly 쿠키 + 모바일 Bearer 토큰), bcryptjs |
| 외부 API / 서비스 | Google Gemini(`@google/genai`), Google·Kakao OAuth, Resend(이메일 인증) |
| 인프라 | Railway(백엔드+웹 호스팅·자동배포), GitHub Actions(데스크톱 릴리즈) |

---

## 회고 문서

> [KPT 방법론 참고](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)

### Keep — 잘 된 점, 다음에도 유지할 것

- Lean Startup Method와 LLM 에이전트를 활용한 빠른 발전으로 보다 만족스러운 프로덕트를 만들 수 있었다.
- 스크럼의 순기능: Xcode계정이 없어서 못 만들고 있던 모바일 앱 배포에 성공했다.
- 초반에 MVP를 생성하고 기능을 테스팅하면서 더욱 효율적인 디버깅과 

### Problem — 아쉬웠던 점, 개선이 필요한 것

- 초반에 팀원 간 속도가 잘 안 맞았던 것 같다. 기술적인 한계 극복과 빠른 개발과 학습위주의 개발에서 클래시가 있었던 것 같다.
- 깔끔한 UI가 장점인 동시에 독창성 및 사용편의성의 면에서 지속적인 수정이 필요했엇다.

### Try — 다음번에 시도해볼 것

- LLM 에이전트 더 적극적으로 시도해보기
- 더 많은 툴 공부 및 시도

### 팀원별 소감

**김민재:**

> 

**이예지:**

> 
- AI 에이전트의 효율성과 능력을 더욱 깊이 실감하게 되는 경험이었습니다.
- 데스크탑 앱 개발 및 크로스 플랫폼 개발에 대해 더 배우는 기회가 되었습니다.
- 개발 방법이나 과정 뿐만이 아니라 개발에 대한 방향성과 앞으로 가질 마음가짐을 다듬을 수 있는 기회였습니다.
- 끝까지 잘 이끌고 도와준 팀원에게 고맙습니다 ㅎㅎ

---

## 참고 자료

### 실시간 인터랙션

**WebSocket**
- https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- https://techblog.woowahan.com/5268/
- https://tech.kakao.com/posts/391
- https://daleseo.com/websocket/
- https://kakaoentertainment-tech.tistory.com/110

**Socket.IO**
- https://socket.io/docs/v4/
- https://inpa.tistory.com/entry/SOCKET-%F0%9F%93%9A-Namespace-Room-%EA%B8%B0%EB%8A%A5
- https://adjh54.tistory.com/549
- https://fred16157.github.io/node.js/nodejs-socketio-communication-room-and-namespace/

**SSE (Server-Sent Events)**
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- https://developer.mozilla.org/ko/docs/Web/API/Server-sent_events/Using_server-sent_events
- https://api7.ai/ko/blog/what-is-sse

**TCP / UDP Socket**
- https://docs.python.org/3/library/socket.html
- https://inpa.tistory.com/entry/NW-%F0%9F%8C%90-%EC%95%84%EC%A7%81%EB%8F%84-%EB%AA%A8%ED%98%B8%ED%95%9C-TCP-UDP-%EA%B0%9C%EB%85%90-%E2%9D%93-%EC%89%BD%EA%B2%8C-%EC%9D%B4%ED%95%B4%ED%95%98%EC%9E%90

**gRPC Streaming**
- https://grpc.io/docs/what-is-grpc/core-concepts/
- https://tech.ktcloud.com/entry/gRPC%EC%9D%98-%EB%82%B4%EB%B6%80-%EA%B5%AC%EC%A1%B0-%ED%8C%8C%ED%97%A4%EC%B9%98%EA%B8%B0-HTTP2-Protobuf-%EA%B7%B8%EB%A6%AC%EA%B3%A0-%EC%8A%A4%ED%8A%B8%EB%A6%AC%EB%B0%8D
- https://tech.ktcloud.com/entry/gRPC%EC%9D%98-%EB%82%B4%EB%B6%80-%EA%B5%AC%EC%A1%B0-%ED%8C%8C%ED%97%A4%EC%B9%98%EA%B8%B02-Channel-Stub
- https://inspirit941.tistory.com/371
- https://devocean.sk.com/blog/techBoardDetail.do?ID=167433

**WebRTC**
- https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- https://webrtc.org/getting-started/overview
- https://web.dev/articles/webrtc-basics?hl=ko
- https://devocean.sk.com/blog/techBoardDetail.do?ID=164885
- https://beomkey-nkb.github.io/%EA%B0%9C%EB%85%90%EC%A0%95%EB%A6%AC/webRTC%EC%A0%95%EB%A6%AC/
- https://gh402.tistory.com/45
- https://on.com2us.com/tech/webrtc-coturn-turn-stun-server-setup-guide/

**QUIC / WebTransport**
- https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API
- https://datatracker.ietf.org/doc/html/rfc9000
- https://news.hada.io/topic?id=13888

#### KCLOUD VM / Cloudflare Tunnel 환경별 주의사항

| 환경 | 사용 가능(권장) 기술 | 포트/조건 | 주의할 기술 |
|---|---|---|---|
| **로컬 / 일반 VM** | HTTP/REST, WebSocket, Socket.IO, SSE, TCP Socket, gRPC Streaming, WebRTC, QUIC/WebTransport 등 대부분 가능 | 직접 포트 개방 가능. 예: 3000, 5000, 8000, 8080, 9000 등. 외부 공개 시 방화벽/보안그룹/공인 IP 설정 필요 | WebRTC는 STUN/TURN 필요 가능. QUIC/WebTransport는 HTTP/3 · UDP 지원 필요 |
| **KCLOUD VM (VPN 내부)** | HTTP/REST, WebSocket, Socket.IO, SSE, WebRTC 시그널링 | 접속 기기 VPN 필요. 기본 허용 포트: **22, 80, 443**. 개발 포트(3000, 8000, 8080 등)는 직접 접근 제한 가능 | TCP Socket은 포트 제한 있음. gRPC는 HTTP/2 설정 필요. WebRTC 미디어·UDP·QUIC/WebTransport 비권장 |
| **KCLOUD VM + Tunnel** | HTTP/REST, WebSocket, Socket.IO, SSE, WebRTC 시그널링 | VM의 `localhost:<port>`를 도메인에 연결. `localPort`는 **1024~65535**. 예: 3000, 8000, 8080 가능 | 순수 TCP Socket, UDP, WebRTC 미디어/DataChannel, QUIC/WebTransport 불가. gRPC 보장 어려움 |
| **외부 서비스 + 우리 도메인** | HTTP/REST, WebSocket, Socket.IO, SSE, WebRTC 시그널링 | Vercel/Netlify/Railway/Render/AWS/GCP 등에 배포 후 CNAME/A 레코드 연결. 보통 외부는 **443** 사용 | WebSocket/gRPC/TCP/UDP는 플랫폼 지원 여부 확인 필요. 서버리스 플랫폼은 장시간 연결 제한 가능 |
| **서버 없이 외부 SaaS 사용** | Supabase Realtime, Firebase, Pusher/Ably, LLM API Streaming | 직접 포트 관리 불필요. 각 서비스 SDK/API 사용 | 커스텀 TCP/UDP 서버 구현 불가. WebRTC는 STUN/TURN 필요할 수 있음 |

### LLM Wrapper

- https://github.com/teddylee777/openai-api-kr
- https://github.com/teddylee777/langchain-kr
- https://devocean.sk.com/blog/techBoardDetail.do?ID=167407
- https://mastra.ai/docs

### Cross-Platform

- https://flutter.dev/
- https://reactnative.dev/
- https://docs.expo.dev/
- https://kotlinlang.org/multiplatform/
