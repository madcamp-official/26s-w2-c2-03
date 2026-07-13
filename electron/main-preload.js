const { contextBridge, ipcRenderer } = require('electron');

// 메인 창에서 로드되는 React 앱(웹)에 노출되는 데스크톱 브리지.
// 일반 브라우저에서 열면 이 객체가 없으므로, React 쪽에서 window.zonemate
// 존재 여부로 데스크톱/웹을 구분해 집중 모드 UI를 조건부로 켠다.
contextBridge.exposeInMainWorld('zonemate', {
  isDesktop: true,

  // 지금 열려 있는 앱 목록(집중 대상 선택용)
  getOpenApps: () => ipcRenderer.invoke('get-open-apps'),

  // 집중 세션 제어. opts = { targetMinutes, taskTitle }
  startFocus: (focusApps, opts = {}) => ipcRenderer.send('start-focus-session', {
    focusApps,
    targetMinutes: opts.targetMinutes ?? null,
    taskTitle: opts.taskTitle ?? null,
  }),
  stopFocus: () => ipcRenderer.send('stop-focus-session'),
  dismissFocusSummary: () => ipcRenderer.send('dismiss-focus-summary'),
  startBreak: (minutes) => ipcRenderer.send('start-break', minutes),
  resumeFocus: () => ipcRenderer.send('resume-focus'),

  // 현재 집중 상태 스냅샷 1회 조회
  getState: () => ipcRenderer.invoke('get-focus-state'),

  // 앱 버전(package.json 기준) — 업데이트가 실제로 적용됐는지 화면에서 확인용
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // 메인 프로세스는 별도 Node 프로세스라 브라우저 쿠키 저장소에 접근할 수
  // 없다 — 로그인 시 렌더러가 authToken 쿠키(non-httpOnly)에서 읽은 값을
  // 여기로 건네주면, 메인 프로세스가 집중 이벤트 기록·실시간 세션 동기화
  // 요청에 Authorization 헤더로 쓴다. 로그아웃 시 clearAuthToken으로 지운다.
  setAuthToken: (token) => ipcRenderer.send('set-auth-token', token),
  clearAuthToken: () => ipcRenderer.send('set-auth-token', null),

  // 실시간 상태 구독 — 메인 프로세스가 1초마다 보내는 스냅샷을 받는다.
  // 반환값은 구독 해제 함수.
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('focus-state', handler);
    return () => ipcRenderer.removeListener('focus-state', handler);
  },
});
