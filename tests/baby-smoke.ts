import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { BABY_TIMING as T, babyView } from '../src/pet/baby-life';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { createPetWindow } from '../src/main/windows';
const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-baby-smoke-'));
app.setPath('userData', directory);
app.on('window-all-closed', () => {});
app.on('quit', () => rmSync(directory, { recursive: true, force: true }));
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
  assert.deepEqual(await run('Object.keys(window.babyLife).sort()'), ['feed', 'onSaveFailed', 'read', 'subscribe']);
  const view = await run('window.babyLife.read()');
  const event = trusted!;
  for (const channel of ['baby:read', 'baby:feed']) {
    assert.throws(() => handlers.get(channel)!({ ...event, sender: {} } as IpcMainInvokeEvent), /REQUEST_DENIED/);
    assert.throws(() => handlers.get(channel)!({ ...event, senderFrame: { url: event.senderFrame!.url } } as IpcMainInvokeEvent), /REQUEST_DENIED/);
  }
  assert.throws(() => handlers.get('baby:read')!(event, 'extra'), /REQUEST_DENIED/);
  for (const args of [[view.offerId, NaN, 100], [view.offerId, 1, 1], [1, 90, 125], [view.offerId, 90, 125, 'extra']]) {
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
  mouse('mouseDown', 150, 42); await pause(); mouse('mouseMove', 5, 5); mouse('mouseUp', 5, 5);
  await pause(); assert.equal(count('food_offered'), 0);
  mouse('mouseDown', 150, 42); await pause();
  await run('window.dispatchEvent(new Event("blur"))');
  mouse('mouseUp', 116, 146); await pause(); assert.equal(count('food_offered'), 0);
  db.exec("CREATE TRIGGER fail_baby BEFORE UPDATE ON baby_life BEGIN SELECT RAISE(ABORT,'test'); END");
  await run('document.querySelector("#food").click()');
  await until(() => run('document.querySelector("#save-status").textContent.includes("저장하지 못")'));
  assert.equal(count('food_offered'), 0);
  await capture('save-failure');
  db.exec('DROP TRIGGER fail_baby');
  mouse('mouseDown', 150, 42); await pause(); mouse('mouseMove', 116, 146); await pause(); mouse('mouseUp', 116, 146);
  await until(() => run('document.querySelector("#egg").dataset.life === "approaching"'));
  assert.equal(count('food_offered'), 1);
  assert.deepEqual(win.getPosition(), originalPosition);
  await run(`window.babyLife.feed(${JSON.stringify(view.offerId)}, 116, 146)`);
  assert.equal(count('food_offered'), 1);
  now += T.approach;
  await run('window.babyLife.read().then(s => { window.testBabyState=s; })');
  await until(() => run('document.querySelector("#egg").dataset.life === "eating"'));
  await capture('eating');
  await new Promise<void>(resolve => { win.webContents.once('did-finish-load', () => resolve()); win.reload(); });
  await until(() => run('document.querySelector("#egg").dataset.life === "eating"'));
  now = T.hungry + T.meal;
  await until(() => run('document.querySelector("#egg").dataset.life === "resting"'));
  assert.equal(count('meal_finished'), 1);
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
  win.destroy(); db.close(); repo.close(); lifecycle.close();
  clearTimeout(timeout);
  console.log('PASS: baby actual pointer drag/cancel/outside drop, foreign/malformed IPC, atomic save failure/retry, meal reload, sleeping contact, screenshots');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
