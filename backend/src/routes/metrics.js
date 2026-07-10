import express from 'express';

const router = express.Router();

/**
 * [POST] /api/metrics
 * os-tracker 에이전트가 수집한 전역 입력 데이터를 수신하는 곳
 */
router.post('/', (req, res) => {
  const incomingLogs = req.body;

  if (!Array.isArray(incomingLogs) || incomingLogs.length === 0) {
    return res.status(400).json({ status: 'error', message: '데이터가 비어있습니다.' });
  }

  console.log(`\n[${new Date().toLocaleTimeString()}] 📥 에이전트로부터 ${incomingLogs.length}개의 이벤트 수신!`);
  
  // 터미널 디버깅용 출력
  incomingLogs.forEach((log) => {
    if (log.type === 'click') {
      console.log(`   - [마우스] 버튼: ${log.button}, 좌표: (${log.x}, ${log.y}), 시각: ${log.time}`);
    } else if (log.type === 'keydown') {
      console.log(`   - [키보드] KeyCode: ${log.keycode}, 시각: ${log.time}`);
    }
  });

  // TODO: 이후 DB 저장 로직이 필요하다면 여기에 작성
  // 예: await db.insert(incomingLogs);

  return res.status(200).json({ status: 'success', message: '로그 저장 완료' });
});

export default router;
