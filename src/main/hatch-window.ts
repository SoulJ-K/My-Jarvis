import { BrowserWindow, ipcMain, powerMonitor, screen, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hatchScenes, type HatchScene, type Lifecycle } from '../pet/lifecycle';
import type { LifecycleRepository } from '../storage/lifecycle-repository';
import type { HatchView } from '../shared/hatch';

const BABY_SIZE = { width: 420, height: 300 };
const expandedScene = (state: Lifecycle) => state.completed === 'baby' || state.completed === 'contact';

/** Controls a witnessed sequence inside the existing transparent pet window. */
export async function createHatchWindow(store: LifecycleRepository, win: BrowserWindow, show: boolean,
  onNamed: (state: Lifecycle, babyPosition: { x: number; y: number }) => void) {
  const page = path.join(__dirname, '../renderer/index.html');
  let disposed = false;
  let active = false;
  let locked = powerMonitor.getSystemIdleState(1) === 'locked';
  let suspended = false;
  // createPetWindow has awaited loadFile before this controller is attached.
  let loading = false;
  let epoch = 0;
  let layout = { x: 0, y: 0, expanded: false };
  const available = () => active && !disposed && !loading && !locked && !suspended &&
    !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  const view = (): HatchView => ({ state: store.read(), available: available(), epoch, layout });
  const changed = () => {
    epoch++;
    if (!disposed && !win.isDestroyed()) win.webContents.send('hatch:changed');
  };
  const expand = () => {
    if (layout.expanded || win.isDestroyed()) return;
    const bounds = win.getBounds();
    // A restarted sequence already at the baby checkpoint starts in the baby-size window.
    if (bounds.width === BABY_SIZE.width && bounds.height === BABY_SIZE.height) {
      layout = { x: 120, y: 50, expanded: true };
      return;
    }
    const area = screen.getDisplayMatching(bounds).workArea;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - BABY_SIZE.width,
      centerX - BABY_SIZE.width / 2)));
    const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - BABY_SIZE.height,
      centerY - BABY_SIZE.height / 2)));
    win.setBounds({ x, y, ...BABY_SIZE }, false);
    // The art is offset by the actual window shift, including edge clamping.
    layout = { x: bounds.x - x, y: bounds.y - y, expanded: true };
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
    const saved = store.apply(Number(args[0]), { type: 'witness', scene: args[2] as HatchScene });
    if (saved.completed === 'baby') expand();
    if (saved.completed === 'contact') {
      win.setFocusable(true);
      win.setIgnoreMouseEvents(false);
      win.show(); win.focus();
    }
    return view();
  });
  ipcMain.handle('hatch:name', (event, ...args: unknown[]) => {
    mutation(event, args);
    if (typeof args[2] !== 'string' || args[2].length > 1024) throw new Error('HATCH_REQUEST_DENIED');
    const saved = store.apply(Number(args[0]), { type: 'name', name: args[2] });
    const result = view();
    if (saved.name !== null) {
      active = false;
      changed();
      // Return the committed result to the naming page before its baby reload.
      setTimeout(() => {
        if (disposed || win.isDestroyed()) return;
        win.setFocusable(false);
        win.setIgnoreMouseEvents(true, { forward: true });
        onNamed(saved, { x: 38 + layout.x, y: 76 + layout.y });
      }, 0);
    }
    return result;
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    powerMonitor.removeListener('lock-screen', lock); powerMonitor.removeListener('unlock-screen', unlock);
    powerMonitor.removeListener('suspend', suspend); powerMonitor.removeListener('resume', resume);
    for (const channel of ['hatch:read', 'hatch:witness', 'hatch:name']) ipcMain.removeHandler(channel);
  };
  return { win, dispose, open() {
    const state = store.read();
    if (!show || disposed || locked || suspended || !state.ready || state.name !== null) return false;
    if (expandedScene(state)) expand();
    active = true;
    if (state.completed === 'contact') {
      win.setFocusable(true);
      win.setIgnoreMouseEvents(false);
      win.show(); win.focus();
    } else win.showInactive();
    changed();
    return true;
  } };
}
