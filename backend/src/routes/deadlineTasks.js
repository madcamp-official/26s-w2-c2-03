import { Router } from 'express';
import { generateDeadlineRoadmap } from '../services/llm.js';

const router = Router();

router.post('/', async (req, res) => {
  const { title, details, deadline } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: '태스크 이름을 입력해주세요' });
  }
  if (!deadline) {
    return res.status(400).json({ error: '마감 날짜와 시간을 입력해주세요' });
  }

  try {
    const result = await generateDeadlineRoadmap({ title, details, deadline });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로드맵을 만드는 데 실패했어요. 잠시 후 다시 시도해주세요.' });
  }
});

export default router;
