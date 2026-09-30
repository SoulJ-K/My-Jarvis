import assert from 'node:assert/strict';
import { mock } from 'node:test';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { app, BrowserWindow, dialog, type Menu, type Session } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { petDatabasePath } from '../../src/storage/pet-repository';
import { nextHatchStep, type Lifecycle } from '../../src/pet/lifecycle';
const [directory, mode, at] = process.argv.slice(2);
const continuity = mode?.startsWith('continuity-');
const hatchStep = mode === 'continuity-step';
if (!directory || !['register','inspect','cancel','ack', 'continuity-register', 'continuity-inspect',
  'continuity-step', 'continuity-feed', 'continuity-praise', 'continuity-deliver', 'continuity-ack'].includes(mode)) throw new Error('Invalid arguments');
app.setPath('userData',directory);
let trayMenu: Menu | undefined;
if (hatchStep) {
  const visible = new Set<number>();
  BrowserWindow.prototype.show = function () { visible.add(this.id); this.emit('show'); };
  BrowserWindow.prototype.showInactive = function () { visible.add(this.id); this.emit('show'); };
  BrowserWindow.prototype.hide = function () { visible.delete(this.id); this.emit('hide'); };
  BrowserWindow.prototype.isVisible = function () { return visible.has(this.id); };
  BrowserWindow.prototype.focus = function () {};
  dialog.showErrorBox = (title, message) => { console.error(`HIDDEN_DIALOG:${title}: ${message}`); };
}
let now = Number(at);
let notices = 0;
let nodeRequests = 0;
let chromiumRequests = 0;
const offlineSessions = new Set<Session>();
if (continuity) {
  assert.ok(Number.isSafeInteger(now) && now > 0);
  Date.now = () => now;
  const start = now;
  Object.defineProperty(performance, 'now', { value: () => now - start });
  // Block external Chromium requests before pages load, including hatch's session.
  // This is scoped to this temporary Electron process, not the machine's network.
  app.on('session-created', session => {
    session.enableNetworkEmulation({ offline: true });
    session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_details, callback) => {
      chromiumRequests++;
      callback({ cancel: true });
    });
    offlineSessions.add(session);
  });
  const denyNodeRequest = () => { nodeRequests++; throw new Error('TEST_OFFLINE'); };
  mock.method(globalThis, 'fetch', async () => denyNodeRequest());
  for (const module of [http, https]) for (const method of ['request', 'get'] as const) mock.method(module, method, denyNodeRequest);
  mock.method(net.Socket.prototype, 'connect', denyNodeRequest);
  mock.method(tls, 'connect', denyNodeRequest);
  // Replace only the native notification boundary before loading production startup.
  // No real Notification object or macOS permission request is made.
  const notifications = require('../../src/main/notifications') as typeof import('../../src/main/notifications');
  notifications.timerNotifications = () => ({
    notify: report => { notices++; report('failed'); }, dispose() {},
  });
}
const timeout = setTimeout(() => app.exit(2),15000);
const modules = require('node:module');
const originalLoad = modules._load;
const appModule = require.resolve('../../src/main/app');
modules._load = function (request: string, parent: { filename: string }, ...args: unknown[]) {
  if (hatchStep && request === 'electron' && parent.filename === appModule) {
    return { ...originalLoad.call(this, request, parent, ...args), Tray: class {
      setTitle() {} setToolTip() {} destroy() {}
      setContextMenu(menu: Menu) { trayMenu = menu; }
    } };
  }
  return originalLoad.call(this, request, parent, ...args);
};
let lifecycle: typeof import('../../src/main/app');
try { lifecycle = require('../../src/main/app'); } finally { modules._load = originalLoad; }
const start = lifecycle.startJarvis;
lifecycle.startJarvis = () => start({ show:hatchStep,
  ...(continuity ? { notifySchedule: (_item: unknown, report: (state: 'failed') => void) => { notices++; report('failed'); } } : {}),
  onReady: async eggWindow => {
  try {
  const panel = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/prompt.html'));
  if (!panel) throw new Error('Missing input panel');
  const run = (code: string) => panel.webContents.executeJavaScript(code);
  if (continuity) {
    const petRun = (code: string) => eggWindow.webContents.executeJavaScript(code);
    const pause = () => new Promise(resolve => setTimeout(resolve, 20));
    const until = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 200; i++) { if (await check()) return; await pause(); }
      throw new Error('CONTINUITY_DID_NOT_SETTLE');
    };
    const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
    const state = (): Lifecycle => JSON.parse(String(db.prepare('SELECT snapshot FROM lifecycle').get()!.snapshot));
    if (mode === 'continuity-step') {
      const saved = state();
      const step = nextHatchStep(saved);
      assert.ok(trayMenu);
      (trayMenu!.items[1].click as () => void)();
      await until(async () => (await petRun('window.hatch.read()')).available);
      await until(() => petRun(`document.querySelector('#hatch-overlay').dataset.step === ${JSON.stringify(step)}`));
      if (step === 'naming') {
        await until(() => petRun('Boolean(document.querySelector("#hatch-overlay form"))'));
        await petRun('document.querySelector("#hatch-overlay input").value="별"; document.querySelector("#hatch-overlay form").requestSubmit()');
      }
      await until(async () => state().revision === saved.revision + 1);
      if (step === 'naming') await until(() => petRun('document.querySelector("#pet-name").textContent === "별"'));
      eggWindow.hide();
    }
    if (mode === 'continuity-register') {
      eggWindow.webContents.sendInputEvent({ type: 'mouseDown', x: 90, y: 95, button: 'left', clickCount: 1 });
      eggWindow.webContents.sendInputEvent({ type: 'mouseUp', x: 90, y: 95, button: 'left', clickCount: 1 });
      await until(async () => db.prepare('SELECT count(*) n FROM egg_care').get()!.n === 1);
      assert.equal((await run("window.timerPanel.submit('continuity-timer','5분 타이머')")).ok, true);
      for (const [id, input] of [['alarm', '오늘 12:05 알람'], ['reminder', '오늘 12:05 리마인더 서류 확인'],
        ['cancelled', '내일 15:00 알람']]) {
        assert.equal((await run(`window.schedulePanel.preview('${id}', ${JSON.stringify(input)})`)).ok, true);
        assert.equal((await run(`window.schedulePanel.confirm('${id}')`)).ok, true);
      }
      assert.equal((await run("window.schedulePanel.cancel('cancelled')")).ok, true);
      assert.equal((await run("window.schedulePanel.preview('unconfirmed','내일 16:00 알람')")).ok, true);
    }
    if (mode === 'continuity-feed') {
      const view = await petRun('window.babyLife.read()');
      assert.ok(view.offerId);
      await petRun(`window.babyLife.feed(${JSON.stringify(view.offerId)},116,146)`);
    }
    if (mode === 'continuity-praise') assert.equal((await run("window.timerPanel.submit('praise','잘했어')")).ok, true);
    if (mode === 'continuity-deliver') {
      now += 300000;
      await until(async () => notices === 3);
    }
    if (mode === 'continuity-ack') {
      await run("window.timerPanel.acknowledge('continuity-timer')");
      for (const id of ['alarm', 'reminder']) await run(`window.schedulePanel.acknowledge('${id}')`);
    }
    const baby = state().name === null ? null : await petRun('window.babyLife.read()');
    await pause();
    for (const win of BrowserWindow.getAllWindows()) {
      assert.equal(win.isVisible(), false);
      assert.ok(offlineSessions.has(win.webContents.session));
    }
    assert.equal(nodeRequests, 0, 'local flows must not call Node network APIs');
    assert.equal(chromiumRequests, 0, 'local flows must not need remote resources');
    // Prove the guard is effective; the reserved URL is cancelled before DNS/network.
    for (const session of offlineSessions) {
      await assert.rejects(session.fetch('https://offline-check.invalid/'), /ERR_BLOCKED_BY_CLIENT/);
    }
    assert.equal(chromiumRequests, offlineSessions.size);
    const result = { pet: await petRun('window.petWindow.snapshot()'), lifecycle: state(), baby,
      timers: await run('window.timerPanel.read()'), schedules: await run('window.schedulePanel.read()'),
      rendered: await run('document.querySelector("#timers").textContent + document.querySelector("#schedules").textContent'),
      care: db.prepare('SELECT * FROM egg_care ORDER BY id').all(),
      experiences: db.prepare('SELECT * FROM baby_experience ORDER BY id').all(),
      socialExperiences: db.prepare('SELECT * FROM baby_social_experience ORDER BY id').all(),
      body: db.prepare('SELECT snapshot FROM baby_life').all(),
      social: db.prepare('SELECT snapshot FROM baby_social').all(), notices };
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
    console.log('CONTINUITY_READY:' + JSON.stringify(result));
    clearTimeout(timeout); app.quit(); return;
  }
  let reply;
  if (mode === 'register') {
    for (const [id,input] of [['alarm','내일 오전 7시 알람'],['reminder','내일 15:00 리마인더 서류 확인']]) {
      const draft = await run(`window.schedulePanel.preview(${JSON.stringify(id)},${JSON.stringify(input)})`);
      if (!draft.ok) throw new Error('Preview failed');
      reply = await run(`window.schedulePanel.confirm(${JSON.stringify(id)})`);
    }
  }
  if (mode === 'cancel') for (const id of ['alarm','reminder']) reply = await run(`window.schedulePanel.cancel('${id}')`);
  if (mode === 'ack') for (const id of ['alarm','reminder']) await run(`window.schedulePanel.acknowledge('${id}')`);
  const after = await run('window.schedulePanel.read()');
  const rendered = await run('new Promise(resolve => setTimeout(() => resolve(document.querySelector("#schedules").textContent),50))');
  const petId = (await eggWindow.webContents.executeJavaScript('window.petWindow.snapshot()')).petId;
  console.log('SCHEDULE_READY:'+JSON.stringify({after,reply,rendered,petId}));
  clearTimeout(timeout); app.quit();
  } catch (error) { console.error(error); throw error; }
}});
require('../../src/main/index');
