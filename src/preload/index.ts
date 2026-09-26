import { contextBridge, ipcRenderer } from 'electron';
import type { EggSnapshot } from '../shared/pet-state';

// Only a read-only pet snapshot and gestures; no filesystem, SQL, shell, or general IPC.
contextBridge.exposeInMainWorld('petWindow', {
  snapshot: () => ipcRenderer.invoke('egg:snapshot'),
  hover: (interactive: boolean) => ipcRenderer.send('egg:hover', interactive),
  beginDrag: () => ipcRenderer.send('egg:drag-start'),
  onStrokeReady: (listener: () => void) => {
    const receive = () => listener();
    ipcRenderer.on('egg:stroke-ready', receive);
    return () => ipcRenderer.removeListener('egg:stroke-ready', receive);
  },
  onSaveFailed: (listener: () => void) => {
    const receive = () => listener();
    ipcRenderer.on('egg:save-failed', receive);
    return () => ipcRenderer.removeListener('egg:save-failed', receive);
  },
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

contextBridge.exposeInMainWorld('babyLife', {
  read: () => ipcRenderer.invoke('baby:read'),
  feed: (offerId: string, x: number, y: number) => ipcRenderer.invoke('baby:feed', offerId, x, y),
  subscribe: (listener: (state: import('../pet/baby-life').BabyView) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, state: import('../pet/baby-life').BabyView) => listener(state);
    ipcRenderer.on('baby:state', receive);
    return () => ipcRenderer.removeListener('baby:state', receive);
  },
  onSaveFailed: (listener: () => void) => {
    const receive = () => listener();
    ipcRenderer.on('baby:save-failed', receive);
    return () => ipcRenderer.removeListener('baby:save-failed', receive);
  },
});
