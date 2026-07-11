const { contextBridge, ipcRenderer } = require('electron');

// 집중 세션 설정 창(focus-setup.html)과 메인 프로세스 사이의 다리.
contextBridge.exposeInMainWorld('focusSetup', {
  // 지금 열려 있는 앱 목록을 요청한다(요청-응답).
  getOpenApps: () => ipcRenderer.invoke('get-open-apps'),
  // 선택한 앱들로 집중 세션을 시작한다.
  startSession: (focusApps) => ipcRenderer.send('start-focus-session', focusApps),
  // 설정을 취소한다.
  cancel: () => ipcRenderer.send('cancel-focus-setup'),
});
