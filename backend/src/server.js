import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
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

if (process.env.FRONTEND_DIST_DIR) {
  const frontendDistDir = process.env.FRONTEND_DIST_DIR;
  const indexHtmlPath = path.join(frontendDistDir, 'index.html');

  if (fs.existsSync(indexHtmlPath)) {
    app.use(express.static(frontendDistDir));
    app.get('*', (req, res) => {
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
