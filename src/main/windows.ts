import { BrowserWindow, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EggSnapshot } from '../shared/pet';
import { EggGesture } from './egg-gesture';
import type { EggCareKind } from '../pet/egg-life';
import { EggBrain } from '../pet/brain';

const WIDTH = 180;
const HEIGHT = 200;

export function initialPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - WIDTH - 48, y: area.y + area.height - HEIGHT - 32 };
}

export async function createPetWindow(pet: EggSnapshot, show = true, care: (kind: EggCareKind) => void = () => {}) {
  const page = path.join(__dirname, '../renderer/index.html');
  const win = new BrowserWindow({
    ...initialPosition(), width: WIDTH, height: HEIGHT,
    title: 'Jarvis Pet · 임시 알',
    // focusable:false alone does not prevent macOS from activating the app on click.
    // A non-activating panel keeps the current app active while the egg receives mouse events.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    transparent: true, backgroundColor: '#00000000', frame: false,
    hasShadow: false, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, acceptFirstMouse: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, spellcheck: false,
    },
  });

  const brain = new EggBrain({
    after(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    },
  }, state => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('pet:state', state);
  });

  let drag: EggGesture | undefined;
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  const clearArm = () => { clearTimeout(armTimer); armTimer = undefined; };
  let ignoring = true;
  win.setIgnoreMouseEvents(true, { forward: true });
  const setInteractive = (interactive: boolean) => {
    if (ignoring === !interactive) return;
    ignoring = !interactive;
    win.setIgnoreMouseEvents(ignoring, { forward: true });
  };
  const validSender = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame?.url === pathToFileURL(page).href;

  const hover = (event: IpcMainEvent, interactive: unknown) => {
    if (validSender(event) && typeof interactive === 'boolean' && !drag) setInteractive(interactive);
  };
  const start = (event: IpcMainEvent, ...args: unknown[]) => {
    if (!validSender(event) || args.length !== 0 || drag) return;
    const [x, y] = win.getPosition();
    drag = new EggGesture(screen.getCursorScreenPoint(), { x, y }, performance.now());
    armTimer = setTimeout(() => {
      if (drag?.arm(performance.now())) win.webContents.send('egg:stroke-ready');
    }, 355);
    setInteractive(true);
  };
  const move = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    if (!validSender(event) || !drag) return;
    // Read OS coordinates in the main process; the page cannot send arbitrary positions.
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - drag.cursor.x;
    const dy = cursor.y - drag.cursor.y;
    drag.move(cursor, performance.now());
    if (!drag.moved || drag.stroking) return;
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - WIDTH, drag.origin.x + dx)));
    const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - HEIGHT, drag.origin.y + dy)));
    win.setPosition(x, y, false);
  };
  const end = (event: IpcMainInvokeEvent) => {
    if (!validSender(event)) return true;
    move(event);
    clearArm();
    const moved = drag?.moved ?? true;
    const kind = drag?.finish();
    drag = undefined;
    setInteractive(false);
    if (kind && brain.snapshot().behavior === 'idle') {
      try {
        care(kind); // Commit before acknowledging; failures cannot look like saved care.
        brain.touch(kind);
      } catch {
        win.webContents.send('egg:save-failed');
      }
    }
    return moved;
  };
  const cancel = (event: IpcMainEvent) => {
    if (!validSender(event)) return;
    clearArm();
    drag = undefined;
    setInteractive(false);
  };
  ipcMain.on('egg:hover', hover);
  ipcMain.on('egg:drag-start', start);
  ipcMain.on('egg:drag-move', move);
  ipcMain.handle('egg:drag-end', end);
  ipcMain.handle('pet:read-state', event => {
    if (!validSender(event)) throw new Error('Pet state request denied');
    return brain.snapshot();
  });
  ipcMain.on('egg:drag-cancel', cancel);
  ipcMain.handle('egg:snapshot', (event, ...args: unknown[]) => {
    if (!validSender(event) || args.length !== 0) throw new Error('EGG_REQUEST_DENIED');
    return { petId: pet.petId, createdAt: pet.createdAt, stage: pet.stage };
  });
  win.on('closed', () => {
    clearArm();
    brain.dispose();
    ipcMain.removeHandler('egg:snapshot');
    ipcMain.removeListener('egg:hover', hover);
    ipcMain.removeListener('egg:drag-start', start);
    ipcMain.removeListener('egg:drag-move', move);
    ipcMain.removeHandler('egg:drag-end');
    ipcMain.removeHandler('pet:read-state');
    ipcMain.removeListener('egg:drag-cancel', cancel);
  });
  win.webContents.on('did-start-loading', () => { clearArm(); drag = undefined; setInteractive(false); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('알 화면이 종료되었습니다:', details.reason);
    win.close();
  });
  await win.loadFile(page);
  if (show) win.showInactive();
  return win;
}
