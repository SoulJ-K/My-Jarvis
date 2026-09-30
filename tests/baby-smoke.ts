import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain, powerMonitor, screen, type IpcMainInvokeEvent } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { BABY_STAGE, BABY_TIMING as T, babyApproachDuration, babyView } from '../src/pet/baby-life';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { createPetWindow } from '../src/main/windows';
const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-baby-smoke-'));
app.setPath('userData', directory);
app.on('window-all-closed', () => {});
app.on('quit', () => {
  // Chromium may still be finishing cache writes during quit. Cleanup failure
  // must stay a reported test warning, never an uncaught native error dialog.
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  catch { console.warn('WARN: temporary test directory cleanup incomplete; retained for later cleanup.'); }
});
const timeout = setTimeout(() => app.exit(2), 30000);
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause(); }
  throw new Error('UI_DID_NOT_SETTLE');
}
app.whenReady().then(async () => {
  app.dock?.hide();
  const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
  let state = lifecycle.apply(0, { type: 'prepare' });
  for (const scene of hatchScenes) state = lifecycle.apply(state.revision, { type: 'witness', scene });
  state = lifecycle.apply(state.revision, { type: 'name', name: '별' });
  let now = 0;
  Date.now = () => now;
  powerMonitor.getSystemIdleTime = () => 0;
  const repo = new BabyLifeRepository(directory, () => now);
  repo.apply({ type: 'tick' }); now = T.hungry;
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  let trusted: IpcMainInvokeEvent;
  const register = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => {
    if (channel.startsWith('baby:')) {
      handlers.set(channel, listener);
      register(channel, (event, ...args) => { trusted = event; return listener(event, ...args); });
    } else register(channel, listener);
  };
  const identity = loadOrCreateEgg(directory);
  let clicks = 0;
  const win = await createPetWindow(identity, false, () => {}, () => ({ ...identity, name: '별' }), repo, () => clicks++);
  win.webContents.setBackgroundThrottling(false);
  const run = (script: string) => win.webContents.executeJavaScript(script);
  await until(() => run('!document.querySelector("#food").hidden'));
  const capture = async (name: string) => {
    assert.equal(await run('document.querySelector("#pet-name").textContent'), '별');
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    writeFileSync(path.join(tmpdir(), `jarvis-baby-${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const originalPosition = win.getPosition();
  assert.deepEqual(win.getSize(), [BABY_STAGE.width, BABY_STAGE.height]);
  assert.deepEqual(await run('Object.keys(window.babyLife).sort()'), ['feed', 'onDirection', 'onSaveFailed', 'read', 'subscribe']);
  const view = await run('window.babyLife.read()');
  const event = trusted!;
  for (const channel of ['baby:read', 'baby:feed']) {
    assert.throws(() => handlers.get(channel)!({ ...event, sender: {} } as IpcMainInvokeEvent), /REQUEST_DENIED/);
    assert.throws(() => handlers.get(channel)!({ ...event, senderFrame: { url: event.senderFrame!.url } } as IpcMainInvokeEvent), /REQUEST_DENIED/);
  }
  assert.throws(() => handlers.get('baby:read')!(event, 'extra'), /REQUEST_DENIED/);
  for (const args of [[view.offerId, NaN, 100], [view.offerId, -1, -1], [1, 90, 125], [view.offerId, 90, 125, 'extra']]) {
    assert.throws(() => handlers.get('baby:feed')!(event, ...args), /REQUEST_DENIED/);
  }
  const foreign = new BrowserWindow({ show: false, webPreferences: { preload: path.join(__dirname, '../src/preload/index.js'), contextIsolation: true, sandbox: true } });
  await foreign.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  assert.equal(await foreign.webContents.executeJavaScript('window.babyLife.read().then(()=>false,()=>true)'), true);
  foreign.destroy();
  const db = new DatabaseSync(petDatabasePath(directory));
  const count = (kind: string) => db.prepare('SELECT COUNT(*) AS n FROM baby_experience WHERE kind=?').get(kind)!.n;
  const mouse = (type: 'mouseDown' | 'mouseMove' | 'mouseUp', x: number, y: number) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  // Actual Chromium pointer capture, without moving the system cursor or focusing apps.
  mouse('mouseDown', 372, 200); await pause(); mouse('mouseMove', 5, 5); mouse('mouseUp', 5, 5);
  await pause(); assert.equal(count('food_offered'), 0);
  mouse('mouseDown', 372, 200); await pause();
  await run('window.dispatchEvent(new Event("blur"))');
  mouse('mouseUp', 116, 146); await pause(); assert.equal(count('food_offered'), 0);
  db.exec("CREATE TRIGGER fail_baby BEFORE UPDATE ON baby_life BEGIN SELECT RAISE(ABORT,'test'); END");
  await run('document.querySelector("#food").click()');
  await until(() => run('document.querySelector("#save-status").textContent.includes("저장하지 못")'));
  assert.equal(count('food_offered'), 0);
  await capture('save-failure');
  db.exec('DROP TRIGGER fail_baby');
  mouse('mouseDown', 372, 200); await pause(); mouse('mouseMove', 220, 190); await pause(); mouse('mouseUp', 220, 190);
  await until(() => run('document.querySelector("#egg").dataset.life === "approaching"'));
  assert.equal(count('food_offered'), 1);
  assert.deepEqual(win.getPosition(), originalPosition);
  await run(`window.babyLife.feed(${JSON.stringify(view.offerId)}, 116, 146)`);
  assert.equal(count('food_offered'), 1);
  const approachMs = babyApproachDuration({ x: BABY_STAGE.startX, y: BABY_STAGE.startY }, 220, 190);
  now += approachMs;
  await run('window.babyLife.read().then(s => { window.testBabyState=s; })');
  await until(() => run('document.querySelector("#egg").dataset.life === "eating"'));
  await new Promise(resolve => setTimeout(resolve, approachMs + 100));
  assert.equal(await run(`(() => {
    const body = document.querySelector('#egg').getBoundingClientRect();
    const bite = document.querySelector('#food span').getBoundingClientRect();
    return Math.abs(body.left - 154) < 1 && Math.abs(body.top - 127) < 1 &&
      bite.left <= body.left + 61 && bite.left >= body.left + 49 &&
      Math.abs(bite.top + bite.height / 2 - (body.top + 63)) < 4;
  })()`), true, 'food meets the mouth after the approach');
  await capture('eating');
  await new Promise<void>(resolve => { win.webContents.once('did-finish-load', () => resolve()); win.reload(); });
  await until(() => run('document.querySelector("#egg").dataset.life === "eating"'));
  now = T.hungry + approachMs + T.chew;
  await until(() => run('document.querySelector("#egg").dataset.life === "resting"'));
  assert.equal(count('meal_finished'), 1);
  assert.deepEqual(await run('window.babyLife.read().then(s => s.position)'), { x: 154, y: 127 });
  now = T.awake;
  await until(() => run('document.querySelector("#egg").dataset.life === "sleeping"'));
  const originalCursor = screen.getCursorScreenPoint;
  screen.getCursorScreenPoint = () => ({ x: 100, y: 100 });
  await run('(async()=>{ window.petWindow.beginDrag(); await window.petWindow.endDrag(); })()');
  screen.getCursorScreenPoint = originalCursor;
  assert.equal(count('sleep_touch'), 1); assert.equal(clicks, 1);
  assert.equal(babyView(repo.read()!).behavior, 'sleeping');
  assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
  await capture('sleeping');
  // Isolated local clock/visibility only: never change the OS clock, lock or cursor.
  const at = (hour: number, minute = 10) => new Date(2026, 8, 26, hour, minute).getTime();
  const refresh = () => run('window.babyLife.read()');
  const socialCount = () => db.prepare('SELECT COUNT(*) AS n FROM baby_social_experience').get()!.n;
  now = at(20);
  win.isVisible = () => true;
  const savedSocial = socialCount();
  await refresh();
  await until(() => run('document.querySelector("#life-caption").textContent === "왔어!"'));
  assert.equal(await run('document.querySelector("#egg").dataset.dayPeriod'), 'night');
  await capture('night-return');
  await new Promise<void>(resolve => { win.webContents.once('did-finish-load', () => resolve()); win.reload(); });
  now += 4000; await refresh();
  await until(() => run('document.querySelector("#egg").dataset.reunion === "false"'));
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(socialCount(), savedSocial, 'night ticks and return never invent user care or solo play');
  powerMonitor.emit('lock-screen'); now += 60 * 60_000;
  await refresh();
  assert.equal(await run('document.querySelector("#egg").dataset.reunion'), 'false');
  powerMonitor.emit('resume'); await refresh(); // Still locked after a resume event.
  assert.equal(await run('document.querySelector("#egg").dataset.reunion'), 'false');
  powerMonitor.emit('unlock-screen'); await refresh();
  await until(() => run('document.querySelector("#egg").dataset.reunion === "true"'));
  now += 4000; await refresh();
  now = at(23); await refresh();
  await until(() => run('document.querySelector("#life-caption").textContent === "왔어…?"'));
  assert.equal(await run('document.querySelector("#egg").dataset.life'), 'drowsy');
  await capture('late-night-return');
  now += 4000; await refresh();
  await until(() => run('document.querySelector("#life-caption").textContent === "졸려…"'));
  now = at(23, 45); await refresh();
  await until(() => run('document.querySelector("#egg").dataset.life === "sleeping"'));
  assert.equal(await run('document.querySelector("#egg").dataset.reunion'), 'false');
  now = at(31); await refresh();
  await until(() => run('document.querySelector("#egg").dataset.dayPeriod === "day"'));
  assert.equal(await run('document.querySelector("#egg").dataset.life'), 'resting');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await run('getComputedStyle(document.querySelector(".shell")).animationName'), 'none');
  win.webContents.debugger.detach();
  await capture('morning-return');
  win.destroy(); db.close(); repo.close(); lifecycle.close();
  clearTimeout(timeout);
  console.log('PASS: baby pointer/feed/storage checks; night/late-night/morning, transient return/reload/lock/resume, sleep priority, reduced motion, screenshots');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
