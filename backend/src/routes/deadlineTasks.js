import { Router } from 'express';
import { generateDeadlineRoadmap } from '../services/llm.js';

const router = Router();

router.post('/', async (req, res) => {
  const { description, deadline } = req.body;

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({ error: '태스크 설명을 입력해주세요' });
  }
  if (!deadline) {
    return res.status(400).json({ error: '마감 날짜와 시간을 입력해주세요' });
  }

  try {
    const result = await generateDeadlineRoadmap({ description, deadline });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로드맵을 만드는 데 실패했어요. 잠시 후 다시 시도해주세요.' });
  }
});

export default router;
