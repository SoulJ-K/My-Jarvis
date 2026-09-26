import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('timerPanel', {
  read: () => ipcRenderer.invoke('timer:read'),
  submit: (id: string, input: string) => ipcRenderer.invoke('timer:submit', id, input),
  cancel: (id: string) => ipcRenderer.invoke('timer:cancel', id),
  acknowledge: (id: string) => ipcRenderer.invoke('timer:ack', id),
  displayed: (id: string) => ipcRenderer.invoke('timer:displayed', id),
  close: () => ipcRenderer.invoke('prompt:close'),
  subscribe: (listener: () => void) => {
    ipcRenderer.on('timer:changed', listener);
    return () => ipcRenderer.removeListener('timer:changed', listener);
  },
  onClose: (listener: () => void) => {
    ipcRenderer.on('prompt:closed', listener);
    return () => ipcRenderer.removeListener('prompt:closed', listener);
  },
  onOpen: (listener: () => void) => {
    ipcRenderer.on('prompt:opened', listener);
    return () => ipcRenderer.removeListener('prompt:opened', listener);
  },
});
contextBridge.exposeInMainWorld('schedulePanel', {
  read: () => ipcRenderer.invoke('schedule:read'),
  preview: (id: string, input: string) => ipcRenderer.invoke('schedule:preview', id, input),
  confirm: (id: string) => ipcRenderer.invoke('schedule:confirm', id),
  discard: () => ipcRenderer.invoke('schedule:discard'),
  cancel: (id: string) => ipcRenderer.invoke('schedule:cancel', id),
  acknowledge: (id: string) => ipcRenderer.invoke('schedule:ack', id),
  displayed: (id: string) => ipcRenderer.invoke('schedule:displayed', id),
  subscribe: (listener: () => void) => {
    ipcRenderer.on('schedule:changed', listener);
    return () => ipcRenderer.removeListener('schedule:changed', listener);
  },
});
