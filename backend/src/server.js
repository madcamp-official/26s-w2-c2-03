import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import questsRouter from './routes/quests.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/quests', questsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`[focuslog-backend] listening on http://localhost:${port}`);
});
