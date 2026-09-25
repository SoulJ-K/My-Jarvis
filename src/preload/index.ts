import { contextBridge, ipcRenderer } from 'electron';

// Only window gestures are exposed; no filesystem, shell, or general IPC access.
contextBridge.exposeInMainWorld('petWindow', {
  hover: (interactive: boolean) => ipcRenderer.send('egg:hover', interactive),
  beginDrag: () => ipcRenderer.send('egg:drag-start'),
  moveDrag: () => ipcRenderer.send('egg:drag-move'),
  endDrag: () => ipcRenderer.invoke('egg:drag-end'),
  cancelDrag: () => ipcRenderer.send('egg:drag-cancel'),
});
