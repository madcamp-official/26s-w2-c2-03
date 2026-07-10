import { Router } from 'express';
import { decomposeQuests } from '../services/claude.js';

const router = Router();

router.post('/decompose', async (req, res) => {
  const { tasks, deadlineTasks } = req.body;

  if (!tasks || typeof tasks !== 'string' || tasks.trim().length === 0) {
    return res.status(400).json({ error: '오늘 할 일을 입력해주세요' });
  }

  try {
    const quests = await decomposeQuests({ tasks, deadlineTasks: deadlineTasks || [] });
    res.json({ quests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '퀘스트 분해에 실패했어요. 잠시 후 다시 시도해주세요.' });
  }
});

export default router;
