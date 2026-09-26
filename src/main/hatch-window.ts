import { BrowserWindow, ipcMain, powerMonitor, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hatchScenes, type HatchScene, type Lifecycle } from '../pet/lifecycle';
import type { LifecycleRepository } from '../storage/lifecycle-repository';
import type { HatchView } from '../shared/hatch';

/** A focusable, explicitly paced scene window. The repository owns identity and
 * committed progress; the main process owns availability and the resume epoch. */
export async function createHatchWindow(store: LifecycleRepository, show: boolean,
  onNamed: (state: Lifecycle) => void) {
  const page = path.join(__dirname, '../renderer/hatch.html');
  const win = new BrowserWindow({ width: 420, height: 560, minWidth: 360, minHeight: 520,
    show: false, title: 'Jarvis Pet · 첫 만남', autoHideMenuBar: true,
    maximizable: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, '../preload/hatch.js'),
      // Non-persistent session isolates hatch permission policy from assistants.
      partition: 'jarvis-hatch',
      nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
  let disposed = false;
  let locked = powerMonitor.getSystemIdleState(1) === 'locked';
  let suspended = false;
  let epoch = 0;
  let loading = true;
  const available = () => !disposed && !loading && !locked && !suspended &&
    !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  const view = (): HatchView => ({ state: store.read(), available: available(), epoch });
  const changed = () => {
    epoch++;
    if (!disposed && !win.isDestroyed()) win.webContents.send('hatch:changed');
  };
  const lock = () => { locked = true; changed(); };
  const unlock = () => { locked = false; changed(); };
  const suspend = () => { suspended = true; changed(); };
  const resume = () => { suspended = false; changed(); };
  powerMonitor.on('lock-screen', lock); powerMonitor.on('unlock-screen', unlock);
  powerMonitor.on('suspend', suspend); powerMonitor.on('resume', resume);
  win.on('show', changed); win.on('hide', changed);
  win.on('minimize', changed); win.on('restore', changed);
  win.webContents.on('did-start-loading', () => { loading = true; changed(); });
  win.webContents.on('did-finish-load', () => { loading = false; changed(); });
  const valid = (event: IpcMainInvokeEvent) => !disposed && !win.isDestroyed() &&
    event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame?.url === pathToFileURL(page).href;
  const check = (event: IpcMainInvokeEvent, args: unknown[], count: number) => {
    if (!valid(event) || args.length !== count) throw new Error('HATCH_REQUEST_DENIED');
  };
  const mutation = (event: IpcMainInvokeEvent, args: unknown[]) => {
    check(event, args, 3);
    if (!Number.isSafeInteger(args[0]) || Number(args[0]) < 0 ||
        !Number.isSafeInteger(args[1]) || Number(args[1]) < 0) throw new Error('HATCH_REQUEST_DENIED');
    if (!available() || args[1] !== epoch) throw new Error('HATCH_PAUSED');
  };
  ipcMain.handle('hatch:read', (event, ...args: unknown[]) => { check(event, args, 0); return view(); });
  ipcMain.handle('hatch:witness', (event, ...args: unknown[]) => {
    mutation(event, args);
    if (!hatchScenes.includes(args[2] as HatchScene)) throw new Error('HATCH_REQUEST_DENIED');
    store.apply(Number(args[0]), { type: 'witness', scene: args[2] as HatchScene });
    return view();
  });
  ipcMain.handle('hatch:name', (event, ...args: unknown[]) => {
    mutation(event, args);
    // Transport bound only; product name policy is enforced by the repository.
    if (typeof args[2] !== 'string' || args[2].length > 1024) throw new Error('HATCH_REQUEST_DENIED');
    const saved = store.apply(Number(args[0]), { type: 'name', name: args[2] });
    const result = view();
    if (saved.name !== null) { onNamed(saved); win.hide(); }
    return result;
  });
  win.on('close', event => { if (!disposed) { event.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    powerMonitor.removeListener('lock-screen', lock); powerMonitor.removeListener('unlock-screen', unlock);
    powerMonitor.removeListener('suspend', suspend); powerMonitor.removeListener('resume', resume);
    for (const channel of ['hatch:read', 'hatch:witness', 'hatch:name']) ipcMain.removeHandler(channel);
    if (!win.isDestroyed()) win.destroy();
  };
  try { await win.loadFile(page); } catch (error) { dispose(); throw error; }
  return { win, dispose, open() {
    if (!show || disposed || store.read().name !== null) return;
    if (win.webContents.isCrashed()) win.reload();
    win.show(); win.focus();
  } };
}
