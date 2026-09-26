import { contextBridge, ipcRenderer } from 'electron';
import type { HatchAPI } from '../shared/hatch';

// No prepare command, arbitrary channel, storage path, or generic mutation bridge.
const api: HatchAPI = {
  read: () => ipcRenderer.invoke('hatch:read'),
  witness: (revision, epoch, scene) => ipcRenderer.invoke('hatch:witness', revision, epoch, scene),
  name: (revision, epoch, name) => ipcRenderer.invoke('hatch:name', revision, epoch, name),
  subscribe(listener) {
    const receive = () => listener();
    ipcRenderer.on('hatch:changed', receive);
    return () => ipcRenderer.removeListener('hatch:changed', receive);
  },
};
contextBridge.exposeInMainWorld('hatch', api);
