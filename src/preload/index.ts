import { contextBridge, ipcRenderer } from 'electron';

// Only a read-only pet snapshot and gestures; no filesystem, SQL, shell, or general IPC.
contextBridge.exposeInMainWorld('petWindow', {
  snapshot: () => ipcRenderer.invoke('egg:snapshot'),
  hover: (interactive: boolean) => ipcRenderer.send('egg:hover', interactive),
  beginDrag: () => ipcRenderer.send('egg:drag-start'),
  moveDrag: () => ipcRenderer.send('egg:drag-move'),
  endDrag: () => ipcRenderer.invoke('egg:drag-end'),
  cancelDrag: () => ipcRenderer.send('egg:drag-cancel'),
});
