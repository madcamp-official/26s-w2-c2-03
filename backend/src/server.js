// 서비스의 모든 시간을 사용자 기준(현재는 서울/KST)으로 통일한다. 서버가
// 어느 지역/타임존에서 돌든 new Date()의 지역시간 계산과 SQLite의
// datetime('now','localtime')이 항상 KST가 되도록, 다른 무엇보다 먼저 TZ를
// 고정한다(나중에 사용자 국가를 받게 되면 이 값을 그 국가로 바꾸면 된다).
// 패키징 앱에서는 Electron이 이미 TZ를 넘겨주지만, 개발 실행·직접 구동
// 대비로 여기서도 세팅한다.
process.env.TZ = process.env.TZ || 'Asia/Seoul';

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import planRouter from './routes/plan.js';
import deadlineTasksRouter from './routes/deadlineTasks.js';
import authRouter from './routes/auth.js';
import plannerDataRouter from './routes/plannerData.js';
import dailyArchiveRouter from './routes/dailyArchive.js';
import metricsRouter from './routes/metrics.js';
import focusEventsRouter from './routes/focusEvents.js';
import devicesRouter from './routes/devices.js';

const app = express();
app.use(cors({ origin: process.env.APP_BASE_URL || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/plan', planRouter);
app.use('/api/deadline-tasks', deadlineTasksRouter);
app.use('/api/auth', authRouter);
app.use('/api/planner-data', plannerDataRouter);
app.use('/api/daily-archives', dailyArchiveRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/focus-events', focusEventsRouter);
app.use('/api/devices', devicesRouter);

// 패키징된 앱/Railway에서는 백엔드가 프론트엔드 정적 빌드도 같은 오리진에서
// 서빙한다. 개발 중에는 Vite dev 서버(:5173)를 쓰므로 FRONTEND_DIST_DIR이
// 없어 건너뛴다. res.sendFile()은 절대경로만 받는데(상대경로면 그냥 무시하지
// 않고 예외를 던짐) FRONTEND_DIST_DIR을 상대경로(예: "frontend/dist")로 줄
// 수도 있으므로 path.resolve()로 항상 절대경로로 정규화한다 — 안 그러면
// express.static이 자동 서빙하는 "/"는 우연히 통과해도, 그 외 SPA 라우트
// (예: OAuth 로그인 후 리다이렉트되는 /nickname, /today)는 이 sendFile
// 폴백을 타면서 500 에러로 죽는다(실제로 카카오 로그인 직후 발생 확인).
const frontendDistDir = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : undefined;
if (frontendDistDir) {
  const indexHtmlPath = path.join(frontendDistDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(frontendDistDir));
    // SPA 폴백: /api가 아닌 GET 요청은 전부 index.html로 넘겨 클라이언트 라우팅에 맡긴다.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(indexHtmlPath);
    });
  } else {
    console.warn(`[zonemate-backend] FRONTEND_DIST_DIR index.html not found: ${indexHtmlPath}`);
  }
}

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`[zonemate-backend] listening on http://localhost:${port}`);
});
