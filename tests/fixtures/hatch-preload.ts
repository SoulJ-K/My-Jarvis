import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('hatchTest', {
  read: () => ipcRenderer.invoke('hatch-test:read'),
  apply: (revision: number, command: unknown) => ipcRenderer.invoke('hatch-test:apply', revision, command),
});
