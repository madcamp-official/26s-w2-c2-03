const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('breakPicker', {
  start: (minutes) => ipcRenderer.send('start-break', minutes),
  cancel: () => ipcRenderer.send('cancel-break-picker'),
});
