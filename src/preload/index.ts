import { contextBridge, ipcRenderer } from 'electron';
import type { EggSnapshot } from '../shared/pet-state';

// Only a read-only pet snapshot and gestures; no filesystem, SQL, shell, or general IPC.
contextBridge.exposeInMainWorld('petWindow', {
  onNativeDragReset: (listener: () => void) => {
    const receive = () => listener();
    ipcRenderer.on('pet:native-drag-reset', receive);
    return () => ipcRenderer.removeListener('pet:native-drag-reset', receive);
  },
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
  setReducedMotion: (enabled: boolean) => ipcRenderer.send('baby:reduced-motion', enabled),
  read: () => ipcRenderer.invoke('baby:read'),
  onDirection: (listener: (direction: 'left' | 'right') => void) => {
    const receive = (_event: Electron.IpcRendererEvent, direction: 'left' | 'right') => listener(direction);
    ipcRenderer.on('baby:direction', receive);
    return () => ipcRenderer.removeListener('baby:direction', receive);
  },
  feed: (offerId: string, x: number, y: number) => ipcRenderer.invoke('baby:feed', offerId, x, y),
  subscribe: (listener: (state: import('../pet/baby-life').BabyPresentation) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, state: import('../pet/baby-life').BabyPresentation) => listener(state);
    ipcRenderer.on('baby:state', receive);
    return () => ipcRenderer.removeListener('baby:state', receive);
  },
  onSaveFailed: (listener: () => void) => {
    const receive = () => listener();
    ipcRenderer.on('baby:save-failed', receive);
    return () => ipcRenderer.removeListener('baby:save-failed', receive);
  },
});

// The witnessed sequence uses this same pet window, never a second renderer.
contextBridge.exposeInMainWorld('hatch', {
  read: () => ipcRenderer.invoke('hatch:read'),
  witness: (revision: number, epoch: number, scene: import('../pet/lifecycle').HatchScene) =>
    ipcRenderer.invoke('hatch:witness', revision, epoch, scene),
  name: (revision: number, epoch: number, name: string) =>
    ipcRenderer.invoke('hatch:name', revision, epoch, name),
  subscribe: (listener: () => void) => {
    const receive = () => listener();
    ipcRenderer.on('hatch:changed', receive);
    return () => ipcRenderer.removeListener('hatch:changed', receive);
  },
});
