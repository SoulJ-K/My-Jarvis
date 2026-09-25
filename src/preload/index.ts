import { contextBridge, ipcRenderer } from 'electron';
import type { EggSnapshot } from '../shared/pet-state';

// Only window gestures are exposed; no filesystem, shell, or general IPC access.
contextBridge.exposeInMainWorld('petWindow', {
  hover: (interactive: boolean) => ipcRenderer.send('egg:hover', interactive),
  beginDrag: () => ipcRenderer.send('egg:drag-start'),
  moveDrag: () => ipcRenderer.send('egg:drag-move'),
  endDrag: () => ipcRenderer.invoke('egg:drag-end'),
  cancelDrag: () => ipcRenderer.send('egg:drag-cancel'),
});

contextBridge.exposeInMainWorld('petBrain', {
  read: () => ipcRenderer.invoke('pet:read-state'),
  subscribe: (listener: (state: EggSnapshot) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, state: EggSnapshot) => listener(state);
    ipcRenderer.on('pet:state', receive);
    return () => ipcRenderer.removeListener('pet:state', receive);
  },
});
