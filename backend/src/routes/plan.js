import { Router } from 'express';
import { generateDailyPlanChat } from '../services/llm.js';

const router = Router();

router.post('/', async (req, res) => {
  const { messages, forceFinalize } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '오늘 할 일을 입력해주세요' });
  }

  try {
    const result = await generateDailyPlanChat({ messages, forceFinalize: Boolean(forceFinalize) });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '계획을 만드는 데 실패했어요. 잠시 후 다시 시도해주세요.' });
  }
});

export default router;
