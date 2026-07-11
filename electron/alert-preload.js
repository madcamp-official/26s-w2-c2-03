const { contextBridge, ipcRenderer } = require('electron');

// 플로팅 알림 창(alert.html)과 메인 프로세스 사이의 안전한 다리.
// contextIsolation을 켠 상태(보안 기본값)에서 렌더러가 직접 ipcRenderer에
// 접근하지 못하므로, 필요한 두 가지 통로만 화이트리스트로 노출한다.
contextBridge.exposeInMainWorld('zonemateAlert', {
  // 메인 프로세스가 보내주는 알림 내용(제목/메시지/버튼)을 받는다.
  onData: (callback) => {
    ipcRenderer.on('alert-data', (_event, data) => callback(data));
  },
  // 사용자가 버튼을 누르면 어떤 액션을 골랐는지 메인 프로세스로 돌려보낸다.
  sendAction: (action) => {
    ipcRenderer.send('alert-action', action);
  },
});
