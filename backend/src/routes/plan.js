import { Router } from 'express';
import { generateDailyPlan } from '../services/llm.js';

const router = Router();

router.post('/', async (req, res) => {
  const { tasks } = req.body;

  if (!tasks || typeof tasks !== 'string' || tasks.trim().length === 0) {
    return res.status(400).json({ error: '오늘 할 일을 입력해주세요' });
  }

  try {
    const items = await generateDailyPlan({ tasks });
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '계획을 만드는 데 실패했어요. 잠시 후 다시 시도해주세요.' });
  }
});

export default router;
