const axios = require('axios');

const BACKEND_URL = process.env.METRICS_BACKEND_URL || 'http://localhost:4000';
const CLIENT_ID = process.env.METRICS_CLIENT_ID || 'windows-diagnostic';

async function check(label, action) {
  try {
    const detail = await action();
    console.log(`✅ ${label}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (err) {
    console.error(`❌ ${label} — ${err.message || err}`);
    return false;
  }
}

async function main() {
  console.log('Zonemate Windows 수집 파이프라인 진단');
  console.log(`Node ${process.version} / ${process.platform} ${process.arch}`);

  if (process.platform !== 'win32') {
    console.warn('⚠️ 이 검사는 Windows 실기기에서 실행해야 네이티브 동작을 확인할 수 있어요.');
  }

  const nativeReady = await check('uiohook 네이티브 모듈 로드', () => {
    const { uIOhook } = require('@mukea/uiohook-napi');
    if (!uIOhook || typeof uIOhook.start !== 'function') throw new Error('uIOhook API를 찾지 못함');
    return '@mukea/uiohook-napi';
  });

  let activeWindowEvent = null;
  const windowReady = await check('Windows 활성 창 조회', async () => {
    const { activeWindow } = await import('get-windows');
    const windowInfo = await activeWindow({ accessibilityPermission: false });
    if (!windowInfo) throw new Error('활성 창 결과가 없음');
    activeWindowEvent = {
      type: 'active_window',
      clientId: CLIENT_ID,
      platform: windowInfo.platform || process.platform,
      appName: windowInfo.owner?.name || null,
      windowTitle: windowInfo.title || null,
      processId: windowInfo.owner?.processId || null,
      processPath: windowInfo.owner?.path || null,
      time: new Date().toISOString(),
    };
    return `${activeWindowEvent.appName || '앱 이름 없음'} / ${activeWindowEvent.windowTitle || '창 제목 없음'}`;
  });

  const backendReady = await check('백엔드 health API', async () => {
    const response = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 3000 });
    if (!response.data?.ok) throw new Error('예상하지 못한 응답');
    return BACKEND_URL;
  });

  let pipelineReady = false;
  if (backendReady) {
    pipelineReady = await check('metrics → focusEngine 전체 연결', async () => {
      const now = new Date().toISOString();
      const events = [
        activeWindowEvent || {
          type: 'active_window',
          clientId: CLIENT_ID,
          appName: 'Visual Studio Code',
          windowTitle: 'Windows diagnostic',
          time: now,
        },
        { type: 'keydown', clientId: CLIENT_ID, keycode: 30, time: now },
        {
          type: 'browser_tab',
          clientId: CLIENT_ID,
          title: 'GitHub diagnostic',
          url: 'https://github.com/',
          time: now,
        },
      ];

      const response = await axios.post(`${BACKEND_URL}/api/metrics`, events, { timeout: 3000 });
      const states = await axios.get(`${BACKEND_URL}/api/metrics/focus-state`, { timeout: 3000 });
      const session = states.data.sessions?.find((item) => item.clientId === CLIENT_ID);
      if (response.data?.status !== 'success' || !session) throw new Error('focus session을 찾지 못함');
      return `clientId=${CLIENT_ID}, classification=${session.focusState.classification}`;
    });
  }

  console.log('\n진단 요약');
  console.log(`- 네이티브 입력 모듈: ${nativeReady ? '준비됨' : '실패'}`);
  console.log(`- 활성 창 API: ${windowReady ? '정상' : '실패'}`);
  console.log(`- 백엔드 파이프라인: ${pipelineReady ? '정상' : '실패'}`);
  console.log('- 실제 클릭/키 입력 이벤트는 npm.cmd start 실행 후 직접 입력해서 확인하세요.');

  if (!nativeReady || !windowReady || !pipelineReady) process.exitCode = 1;
}

main();
