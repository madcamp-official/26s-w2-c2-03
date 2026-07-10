import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import planRouter from './routes/plan.js';
import deadlineTasksRouter from './routes/deadlineTasks.js';
import authRouter from './routes/auth.js';
import plannerDataRouter from './routes/plannerData.js';

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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`[focuslog-backend] listening on http://localhost:${port}`);
});
