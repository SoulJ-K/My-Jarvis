import { BrowserWindow, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WIDTH = 180;
const HEIGHT = 200;
const DRAG_THRESHOLD = 6;

export function initialPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - WIDTH - 48, y: area.y + area.height - HEIGHT - 32 };
}

export async function createPetWindow(show = true) {
  const page = path.join(__dirname, '../renderer/index.html');
  const win = new BrowserWindow({
    ...initialPosition(), width: WIDTH, height: HEIGHT,
    title: 'Jarvis Pet · 임시 알',
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

  let drag: { cursor: Electron.Point; origin: Electron.Point; moved: boolean } | undefined;
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
  const start = (event: IpcMainEvent) => {
    if (!validSender(event)) return;
    const [x, y] = win.getPosition();
    drag = { cursor: screen.getCursorScreenPoint(), origin: { x, y }, moved: false };
    setInteractive(true);
  };
  const move = (event: IpcMainEvent) => {
    if (!validSender(event) || !drag) return;
    // Read OS coordinates in the main process; the page cannot send arbitrary positions.
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - drag.cursor.x;
    const dy = cursor.y - drag.cursor.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - WIDTH, drag.origin.x + dx)));
    const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - HEIGHT, drag.origin.y + dy)));
    win.setPosition(x, y, false);
  };
  const end = (event: IpcMainInvokeEvent) => {
    if (!validSender(event)) return true;
    const moved = drag?.moved ?? true;
    drag = undefined;
    setInteractive(false);
    return moved;
  };
  const cancel = (event: IpcMainEvent) => {
    if (!validSender(event)) return;
    drag = undefined;
    setInteractive(false);
  };
  ipcMain.on('egg:hover', hover);
  ipcMain.on('egg:drag-start', start);
  ipcMain.on('egg:drag-move', move);
  ipcMain.handle('egg:drag-end', end);
  ipcMain.on('egg:drag-cancel', cancel);
  win.on('closed', () => {
    ipcMain.removeListener('egg:hover', hover);
    ipcMain.removeListener('egg:drag-start', start);
    ipcMain.removeListener('egg:drag-move', move);
    ipcMain.removeHandler('egg:drag-end');
    ipcMain.removeListener('egg:drag-cancel', cancel);
  });
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
