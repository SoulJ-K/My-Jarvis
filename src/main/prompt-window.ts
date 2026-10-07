import { panelAction, menuMode, requestId } from '../assistant/panel-input';
import type { AssistantPanelAPI } from '../shared/assistant-panel';
import { parseBabyInput, type SocialCommand } from '../pet/baby-social';
import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TimerService } from '../assistant/timer';
import type { ReminderService } from '../assistant/reminders';

/** Separate focusable input; the pet window stays non-activating. */
export async function createPromptWindows(service: TimerService, showNotices = true, schedules?: ReminderService, interact?: (command: SocialCommand) => string | null, assistant?: {
    api: Omit<AssistantPanelAPI, 'subscribe'>; card: BrowserWindow; cardPage: string;
  }) {
  const page = path.join(__dirname, '../renderer/prompt.html');
  const noticePage = path.join(__dirname, '../renderer/timer-notice.html');
  const preferences = { preload: path.join(__dirname, '../preload/prompt.js'),
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false };
  const prompt = new BrowserWindow({ width: 460, height: 610, minWidth: 380, minHeight: 460,
    show: false, title: 'Jarvis Pet · 앱 안내', autoHideMenuBar: true, minimizable: false,
    maximizable: false, fullscreenable: false, webPreferences: preferences });
  const notice = new BrowserWindow({ width: 340, height: 150, show: false,
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    frame: false, focusable: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: preferences });
  let disposed = false;
  let hideNotice: ReturnType<typeof setTimeout> | undefined;
  const announced = new Set<string>();
  const valid = (event: IpcMainInvokeEvent, allowNotice = false) => {
    const target = !prompt.isDestroyed() && event.sender === prompt.webContents ? prompt :
      allowNotice && !notice.isDestroyed() && event.sender === notice.webContents ? notice : undefined;
    return target && !target.isDestroyed() && event.senderFrame === target.webContents.mainFrame &&
      event.senderFrame?.url === pathToFileURL(target === prompt ? page : noticePage).href;
  };
  const handlers: string[] = [];
  const handle = (channel: string, allowNotice: boolean, count: number, callback: (...args: unknown[]) => unknown) => {
    handlers.push(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!valid(event, allowNotice) || args.length !== count) throw new Error('PROMPT_REQUEST_DENIED');
      try { return callback(...args); }
      catch { throw new Error(channel.startsWith('schedule:') ? 'SCHEDULE_ACTION_FAILED' : 'TIMER_ACTION_FAILED'); }
    });
  };
  const id = (value: unknown): string => {
    if (typeof value !== 'string' || !/^[\w-]{1,80}$/.test(value)) throw new Error('INVALID_ID');
    return value;
  };
  handle('timer:read', true, 0, () => service.views());
  handle('timer:submit', false, 2, (requestId: unknown, input: unknown) => {
    id(requestId);
    const command = parseBabyInput(input);
    if (command && interact) {
      const message = interact(command);
      return { ok: message !== null, message: message ?? '아기가 된 뒤에 이야기할 수 있어요.', timers: service.views() };
    }
    const reply = service.submit(requestId, input);
    return reply;
  });
  handle('timer:cancel', false, 1, (value: unknown) => service.cancel(id(value)));
  handle('timer:ack', false, 1, (value: unknown) => service.acknowledge(id(value)));
  handlers.push('timer:displayed');
  ipcMain.handle('timer:displayed', (event, ...args: unknown[]) => {
    if (!valid(event, true) || args.length !== 1) throw new Error('PROMPT_REQUEST_DENIED');
    const owner = event.sender === prompt.webContents ? prompt : notice;
    // Chromium can report document.hidden=false for a never-shown Electron window.
    if (owner.isVisible() && !owner.isMinimized()) service.displayed(id(args[0]));
  });
  const scheduleService = () => {
    if (!schedules) throw new Error('SCHEDULE_UNAVAILABLE');
    return schedules;
  };
  handle('schedule:read', true, 0, () => scheduleService().views());
  handle('schedule:preview', false, 2, (requestId, input) => scheduleService().preview(id(requestId), input));
  handle('schedule:confirm', false, 1, value => scheduleService().confirm(id(value)));
  handle('schedule:discard', false, 0, () => schedules?.discard());
  handle('schedule:cancel', false, 1, value => scheduleService().cancel(id(value)));
  handle('schedule:ack', false, 1, value => scheduleService().acknowledge(id(value)));
  handlers.push('schedule:displayed');
  ipcMain.handle('schedule:displayed', (event, ...args: unknown[]) => {
    if (!valid(event, true) || args.length !== 1) throw new Error('PROMPT_REQUEST_DENIED');
    const value = id(args[0]);
    const owner = event.sender === prompt.webContents ? prompt : notice;
    if (owner.isVisible() && !owner.isMinimized()) scheduleService().displayed(value);
  });
  if (assistant) {
    const accept = (event: IpcMainInvokeEvent) => valid(event) ||
      (!assistant.card.isDestroyed() && event.sender === assistant.card.webContents &&
        event.senderFrame === assistant.card.webContents.mainFrame && event.senderFrame?.url === pathToFileURL(assistant.cardPage).href);
    handlers.push('assistant:read', 'assistant:action', 'assistant:submit-timer', 'assistant:snack');
    ipcMain.handle('assistant:read', (event, ...args: unknown[]) => {
      if (!accept(event) || args.length) throw new Error('PANEL_REQUEST_DENIED');
      return assistant.api.read();
    });
    ipcMain.handle('assistant:action', (event, ...args: unknown[]) => {
      if (!accept(event) || args.length !== 1) throw new Error('PANEL_REQUEST_DENIED');
      const action = panelAction(args[0]);
      if (!valid(event) && !['done', 'later', 'undo', 'cancel'].includes(action.type)) throw new Error('PANEL_REQUEST_DENIED');
      return assistant.api.action(action);
    });
    ipcMain.handle('assistant:submit-timer', (event, ...args: unknown[]) => {
      if (!valid(event) || args.length !== 4 || typeof args[1] !== 'string' || args[1].length > 500 || typeof args[3] !== 'boolean') throw new Error('PANEL_REQUEST_DENIED');
      return assistant.api.submitTimer(requestId(args[0]), args[1], menuMode(args[2]), args[3]);
    });
    ipcMain.handle('assistant:snack', (event, ...args: unknown[]) => {
      if (!valid(event) || args.length) throw new Error('PANEL_REQUEST_DENIED');
      return assistant.api.snack();
    });
  }
  const closeInput = () => {
    schedules?.discard();
    if (prompt.isFocused()) prompt.blur();
    prompt.hide();
    prompt.webContents.send('prompt:closed');
  };
  handle('prompt:close', false, 0, closeInput);
  prompt.on('close', event => { if (!disposed) { event.preventDefault(); closeInput(); } });
  for (const win of [prompt, notice]) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
  }
  try { await Promise.all([prompt.loadFile(page), notice.loadFile(noticePage)]); }
  catch (error) {
    disposed = true;
    for (const channel of handlers) ipcMain.removeHandler(channel);
    prompt.destroy(); notice.destroy(); throw error;
  }
  const refresh = () => {
    if (disposed) return;
    // A broken assistant store must not prevent the other assistant's delivery.
    let rows: ReturnType<TimerService['views']> = [];
    let scheduleRows: ReturnType<ReminderService['views']> = [];
    try { rows = service.views(); } catch { /* Each panel read reports its own failure. */ }
    try { scheduleRows = schedules?.views() ?? []; } catch { /* Preserve timer delivery. */ }
    for (const win of [prompt, notice]) if (!win.isDestroyed()) win.webContents.send('timer:changed');
    for (const win of [prompt, notice]) if (!win.isDestroyed()) win.webContents.send('schedule:changed');
    // Initial native alerts never open a duplicate app popup. Baby follow-up is separate.
    prompt.webContents.send('assistant:changed');
  };
  return {
    prompt, notice, refresh,
    // Notification results temporarily dismiss the panel, never discard its draft.
    hideForResult() { if (!disposed && !prompt.isDestroyed()) prompt.hide(); },
    open() {
      const opening = !prompt.isVisible();
      if (!opening && prompt.isFocused()) return;
      // A window behind another app is still "visible". Bring the same panel
      // forward without replaying opening UI or disturbing an existing draft.
      prompt.show(); prompt.focus();
      if (opening) { prompt.webContents.send('prompt:opened'); refresh(); }
    },
    dispose() {
      disposed = true; clearTimeout(hideNotice);
      for (const channel of handlers) ipcMain.removeHandler(channel);
      prompt.destroy(); notice.destroy();
    },
  };
}
