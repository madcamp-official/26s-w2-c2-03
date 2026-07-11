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

// 패키징된 앱에서는 백엔드가 프론트엔드 정적 빌드도 같은 오리진에서 서빙한다.
// 개발 중에는 Vite dev 서버(:5173)를 쓰므로 FRONTEND_DIST_DIR이 없어 건너뛴다.
const frontendDistDir = process.env.FRONTEND_DIST_DIR;
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
