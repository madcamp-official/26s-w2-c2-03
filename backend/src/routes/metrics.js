import express from 'express';
import { createFocusMetricsAdapter } from '../services/focusMetricsAdapter.js';

const router = express.Router();
const focusAdapter = createFocusMetricsAdapter();

router.get('/focus-state', (req, res) => {
  res.json({ sessions: focusAdapter.getStates() });
});

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
    } else if (log.type === 'active_window') {
      console.log(
        `   - [활성 창] ${log.appName || '알 수 없는 앱'} | ${log.windowTitle || '제목 없음'} `
        + `| PID: ${log.processId ?? '-'} | ${log.time}`
      );
    } else if (log.type === 'browser_tab') {
      console.log(
        `   - [브라우저 탭] ${log.title || '제목 없음'} | ${log.url || 'URL 없음'} | ${log.time}`
      );
    }
  });

  const focusSessions = focusAdapter.ingest(incomingLogs);

  // TODO: 이후 DB 저장 로직이 필요하다면 여기에 작성
  // 예: await db.insert(incomingLogs);

  return res.status(200).json({
    status: 'success',
    message: '로그 처리 완료',
    focusSessions,
  });
});

export default router;
