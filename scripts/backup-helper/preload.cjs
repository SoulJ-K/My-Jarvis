const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('backupHelper', {
  send: (action, value) => ipcRenderer.invoke('backup-helper', action, value),
  onWait: callback => ipcRenderer.on('backup-helper-wait', () => callback()),
});
