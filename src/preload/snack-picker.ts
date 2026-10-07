import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('trashPicker',{
  read:()=>ipcRenderer.invoke('trash-picker:read'),
  choose:(ids:string[])=>ipcRenderer.invoke('trash-picker:choose',ids),
  cancel:()=>ipcRenderer.invoke('trash-picker:cancel'),
});
