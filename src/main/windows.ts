import { BABY_STAGE, babyApproachDuration, babyDayPeriod, babyTargetForFood, validFoodPoint,
  type BabyPosition } from '../pet/baby-life';
import type { BabyLifeRepository } from '../storage/baby-life-repository';
import { app, BrowserWindow, ipcMain, screen, powerMonitor, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { appendFileSync, lstatSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EggSnapshot } from '../shared/pet';
import { EggGesture } from './egg-gesture';
import type { EggCareKind } from '../pet/egg-life';
import { BabyReturnBrain, EggBrain } from '../pet/brain';

const WIDTH = 180;
const HEIGHT = 200;
const DIAGNOSTIC_LIMIT = 16 * 1024;

// Fixed event codes only: never include a pet ID, text, coordinates or a data path.
export function recordPetDiagnostic(event: string) {
  try {
    const file = path.join(app.getPath('userData'), 'pet-diagnostics.log');
    const line = `${new Date().toISOString()} ${event}\n`;
    try {
      const existing = lstatSync(file);
      if (!existing.isFile() || existing.isSymbolicLink()) return;
      if (existing.size >= DIAGNOSTIC_LIMIT) writeFileSync(file, line, { mode: 0o600 });
      else appendFileSync(file, line, { mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') writeFileSync(file, line, { flag: 'wx', mode: 0o600 });
      else throw error;
    }
  } catch { /* Diagnostics must never prevent pet startup or shutdown. */ }
}

function stageSize(stage: 'egg' | 'baby') {
  return stage === 'baby' ? { width: BABY_STAGE.width, height: BABY_STAGE.height } : { width: WIDTH, height: HEIGHT };
}
function clampPosition(point: Electron.Point, area: Electron.Rectangle, size: { width: number; height: number }) {
  // Electron cursor, workArea and window positions all use logical pixels (DIP).
  return {
    x: Math.round(Math.max(area.x, Math.min(area.x + area.width - size.width, point.x))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - size.height, point.y))),
  };
}

export function initialPosition(stage: 'egg' | 'baby' = 'egg') {
  const area = screen.getPrimaryDisplay().workArea;
  const size = stageSize(stage);
  return clampPosition({ x: area.x + area.width - size.width - 48,
    y: area.y + area.height - size.height - 32 }, area, size);
}

export async function createPetWindow(pet: EggSnapshot, show = true, care: (kind: EggCareKind) => void = () => {},
  currentPet: () => EggSnapshot & { name?: string | null } = () => pet, baby?: BabyLifeRepository,
  onBabyClick: () => void = () => {}, shouldRecover: () => boolean = () => true) {
  const page = path.join(__dirname, '../renderer/index.html');
  const initialSize = stageSize(pet.stage);
  const win = new BrowserWindow({
    ...initialPosition(pet.stage), ...initialSize,
    title: pet.stage === 'baby' ? 'Jarvis Pet · 아기' : 'Jarvis Pet · 임시 알',
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
  let strokeSampler: ReturnType<typeof setInterval> | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let healthyTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryAttempts = 0;
  let recovering = false;
  const clearArm = () => {
    clearTimeout(armTimer); armTimer = undefined;
    clearInterval(strokeSampler); strokeSampler = undefined;
  };
  let ignoring = true;
  win.setIgnoreMouseEvents(true, { forward: true });
  const setInteractive = (interactive: boolean) => {
    if (ignoring === !interactive) return;
    ignoring = !interactive;
    win.setIgnoreMouseEvents(ignoring, { forward: true });
  };
  const cancelGesture = () => {
    clearArm();
    drag = undefined;
    setInteractive(false);
  };
  // A new document has no pointer capture; do not leave the old gesture active.
  win.webContents.on('did-start-loading', cancelGesture);
  const recoverPosition = () => {
    if (win.isDestroyed()) return;
    if (drag) cancelGesture();
    const bounds = win.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const position = clampPosition(bounds, area, bounds);
    if (position.x !== bounds.x || position.y !== bounds.y) {
      win.setPosition(position.x, position.y, false);
      recordPetDiagnostic('pet_window_repositioned');
    }
  };
  screen.on('display-removed', recoverPosition);
  screen.on('display-metrics-changed', recoverPosition);
  const validSender = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame?.url === pathToFileURL(page).href;

  const hover = (event: IpcMainEvent, interactive: unknown) => {
    if (validSender(event) && typeof interactive === 'boolean' && !drag) setInteractive(interactive);
  };
  const moveCursor = () => {
    if (!drag) return;
    // Read OS coordinates in the main process; the page cannot send arbitrary positions.
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - drag.cursor.x;
    const dy = cursor.y - drag.cursor.y;
    drag.move(cursor, performance.now());
    if (!drag.moved || drag.stroking) return;
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const position = clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, area, win.getBounds());
    win.setPosition(position.x, position.y, false);
  };
  const start = (event: IpcMainEvent, ...args: unknown[]) => {
    if (!validSender(event) || args.length !== 0 || drag) return;
    const [x, y] = win.getPosition();
    drag = new EggGesture(screen.getCursorScreenPoint(), { x, y }, performance.now(), currentPet().stage === 'egg');
    armTimer = setTimeout(() => {
      if (currentPet().stage === 'egg' && drag?.arm(performance.now())) {
        win.webContents.send('egg:stroke-ready');
        // macOS can coalesce short pointer moves in a non-activating panel.
        // Sample only while a held egg is in stroke mode, never in idle life.
        strokeSampler = setInterval(moveCursor, 16);
      }
    }, 355);
    setInteractive(true);
  };
  const move = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    if (!validSender(event) || !drag) return;
    moveCursor();
  };
  const end = (event: IpcMainInvokeEvent) => {
    if (!validSender(event)) return true;
    move(event);
    clearArm();
    const moved = drag?.moved ?? true;
    const kind = drag?.finish();
    drag = undefined;
    setInteractive(false);
    if (kind && currentPet().stage === 'egg' && brain.snapshot().behavior === 'idle') {
      try {
        care(kind); // Commit before acknowledging; failures cannot look like saved care.
        brain.touch(kind);
      } catch {
        win.webContents.send('egg:save-failed');
      }
    }
    if (kind && currentPet().stage === 'baby' && baby) {
      try { publishBaby(baby.view(baby.apply({ type: 'touch' }))); }
      catch { win.webContents.send('egg:save-failed'); }
      onBabyClick();
    }
    return moved;
  };
  const cancel = (event: IpcMainEvent) => {
    if (!validSender(event)) return;
    cancelGesture();
  };
  const babyReady = () => Boolean(baby && currentPet().stage === 'baby' && currentPet().name);
  let babyPosition: BabyPosition = { x: BABY_STAGE.startX, y: BABY_STAGE.startY };
  let activeMealTarget: BabyPosition | null = null;
  // Capture the saved observation before the first page read advances life.
  const returnBrain = new BabyReturnBrain(baby?.read()?.observedAtMs ?? null);
  const publishBaby = (view: ReturnType<BabyLifeRepository['view']>) => {
    if (view.meal) activeMealTarget = babyTargetForFood(view.meal.x, view.meal.y);
    else if (activeMealTarget) { babyPosition = activeMealTarget; activeMealTarget = null; }
    const reunion = returnBrain.observe(Date.now(), win.isVisible() && !win.isMinimized() && !socialSuspended && !socialLocked,
      powerMonitor.getSystemIdleTime() * 1000);
    const presentation = { ...view, position: babyPosition, reunion };
    if (!win.isDestroyed()) win.webContents.send('baby:state', presentation);
    return presentation;
  };
  let socialSuspended = false;
  let socialLocked = false;
  const suspendSocial = () => { recordPetDiagnostic('system_suspended'); socialSuspended = true; tickBaby(); };
  const resumeSocial = () => {
    recordPetDiagnostic('system_resumed'); socialSuspended = false;
    try { recoverPosition(); } catch { recordPetDiagnostic('pet_position_recovery_failed'); }
  };
  const lockSocial = () => { recordPetDiagnostic('screen_locked'); socialLocked = true; tickBaby(); };
  const unlockSocial = () => {
    recordPetDiagnostic('screen_unlocked'); socialLocked = false;
    try { recoverPosition(); } catch { recordPetDiagnostic('pet_position_recovery_failed'); }
  };
  powerMonitor.on('suspend', suspendSocial); powerMonitor.on('lock-screen', lockSocial);
  powerMonitor.on('resume', resumeSocial); powerMonitor.on('unlock-screen', unlockSocial);
  const tickBaby = () => {
    if (!babyReady()) return;
    try {
      const active = win.isVisible() && !win.isMinimized() && !socialSuspended && !socialLocked && !drag &&
        babyDayPeriod(Date.now()) === 'day';
      const cursor = active ? screen.getCursorScreenPoint() : null;
      const bounds = win.getBounds();
      const cursorNear = Boolean(cursor && Math.hypot(cursor.x - bounds.x - babyPosition.x - 52,
        cursor.y - bounds.y - babyPosition.y - 46) <= 75);
      const view = baby!.view(baby!.apply({ type: 'tick', active, cursorNear }));
      // Direction is transient presentation only; cursor coordinates never enter storage.
      win.webContents.send('baby:direction', cursor && cursor.x < bounds.x + babyPosition.x + 52 ? 'left' : 'right');
      publishBaby(view);
    }
    catch { if (!win.isDestroyed()) win.webContents.send('baby:save-failed'); }
  };
  const babyTimer = setInterval(tickBaby, 1000);
  win.on('hide', () => { recordPetDiagnostic('pet_window_hidden'); tickBaby(); });
  win.on('show', () => recordPetDiagnostic('pet_window_shown'));
  ipcMain.handle('baby:read', (event, ...args: unknown[]) => {
    if (!validSender(event) || args.length !== 0) throw new Error('BABY_REQUEST_DENIED');
    if (!babyReady()) return null;
    return publishBaby(baby!.view(baby!.apply({ type: 'tick' })));
  });
  ipcMain.handle('baby:feed', (event, ...args: unknown[]) => {
    const [offerId, x, y] = args;
    if (!validSender(event) || !babyReady() || args.length !== 3 || typeof offerId !== 'string' ||
      !/^food:[0-9]{1,16}$/.test(offerId) || !validFoodPoint(x, y)) throw new Error('BABY_REQUEST_DENIED');
    const approachMs = babyApproachDuration(babyPosition, x as number, y as number);
    return publishBaby(baby!.view(baby!.apply({ type: 'feed', offerId, x: x as number, y: y as number, approachMs })));
  });
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
    return currentPet();
  });
  win.on('closed', () => {
    recordPetDiagnostic('pet_window_closed');
    clearTimeout(recoveryTimer);
    clearTimeout(healthyTimer);
    clearInterval(babyTimer);
    powerMonitor.removeListener('suspend', suspendSocial); powerMonitor.removeListener('lock-screen', lockSocial);
    powerMonitor.removeListener('resume', resumeSocial); powerMonitor.removeListener('unlock-screen', unlockSocial);
    ipcMain.removeHandler('baby:read');
    ipcMain.removeHandler('baby:feed');
    clearArm();
    brain.dispose();
    screen.removeListener('display-removed', recoverPosition);
    screen.removeListener('display-metrics-changed', recoverPosition);
    ipcMain.removeHandler('egg:snapshot');
    ipcMain.removeListener('egg:hover', hover);
    ipcMain.removeListener('egg:drag-start', start);
    ipcMain.removeListener('egg:drag-move', move);
    ipcMain.removeHandler('egg:drag-end');
    ipcMain.removeHandler('pet:read-state');
    ipcMain.removeListener('egg:drag-cancel', cancel);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.on('render-process-gone', (_event, details) => {
    // The main process still owns the pet and its storage. Reuse this window so
    // a renderer crash cannot trigger window-all-closed or create a second pet.
    recordPetDiagnostic(`pet_renderer_gone_${details.reason}`);
    console.error('펫 화면 프로세스 종료:', details.reason);
    clearTimeout(healthyTimer);
    if (!shouldRecover() || win.isDestroyed()) return;
    if (recoveryAttempts >= 2) {
      recordPetDiagnostic('pet_renderer_recovery_exhausted');
      return;
    }
    recoveryAttempts++;
    recovering = true;
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => {
      if (win.isDestroyed() || !shouldRecover()) return;
      recordPetDiagnostic('pet_renderer_reload_attempt');
      try { win.reload(); }
      catch { recordPetDiagnostic('pet_renderer_reload_failed'); }
    }, recoveryAttempts * 300);
  });
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) recordPetDiagnostic('pet_renderer_load_failed');
  });
  win.webContents.on('did-finish-load', () => {
    const size = stageSize(currentPet().stage);
    const bounds = win.getBounds();
    if (bounds.width !== size.width || bounds.height !== size.height) {
      const area = screen.getDisplayMatching(bounds).workArea;
      const point = clampPosition({ x: bounds.x + Math.round((bounds.width - size.width) / 2),
        y: bounds.y + Math.round((bounds.height - size.height) / 2) }, area, size);
      win.setBounds({ ...point, ...size }, false);
    }
    if (!recovering && recoveryAttempts < 2) return;
    recovering = false;
    recordPetDiagnostic('pet_renderer_recovered');
    // Two immediate repeated crashes are bounded; a later independent crash can recover.
    clearTimeout(healthyTimer);
    healthyTimer = setTimeout(() => { recoveryAttempts = 0; }, 30_000);
  });
  await win.loadFile(page);
  if (show) win.showInactive();
  return win;
}
