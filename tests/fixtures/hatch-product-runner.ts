import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain, powerMonitor, screen, type IpcMainInvokeEvent } from 'electron';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { loadOrCreateEgg, petDatabasePath } from '../../src/storage/pet-repository';
import { openEggLife } from '../../src/storage/egg-life-repository';
import { hatchScenes, nextHatchStep, type Lifecycle } from '../../src/pet/lifecycle';
import type { HatchView } from '../../src/shared/hatch';

const lifecycle = require('../../src/main/app') as typeof import('../../src/main/app');
const startJarvis = lifecycle.startJarvis;
const [directory, mode] = process.argv.slice(2);
if (!directory || !['inspect', 'step', 'exercise', 'ready-live', 'ready-care', 'ready-startup'].includes(mode)) throw new Error('INVALID_TEST_ARGUMENTS');
app.setPath('userData', directory);
const readinessMode = mode.startsWith('ready-');
let eggNow = 0;
if (readinessMode) {
  eggNow = Date.parse(loadOrCreateEgg(directory).createdAt);
  openEggLife(directory, () => eggNow).close();
  if (mode === 'ready-startup') eggNow += 1000;
}
const timeout = setTimeout(() => app.exit(2), 25000);
const register = ipcMain.handle.bind(ipcMain);
const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
let trustedEvent: IpcMainInvokeEvent;
ipcMain.handle = (channel, listener) => {
  if (channel.startsWith('hatch:')) {
    handlers.set(channel, listener);
    register(channel, (event, ...args) => { trustedEvent = event; return listener(event, ...args); });
  } else register(channel, listener);
};
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await pause(); }
  throw new Error('UI_DID_NOT_SETTLE');
}
lifecycle.startJarvis = () => startJarvis({ show: false,
  ...(readinessMode ? { hatchPolicy: { baseDurationMs: 1000, careReductionMs: { touch: 100, stroke: 200 }, maxCareReductionMs: 300, careIntervalMs: 100 }, eggNow: () => eggNow } : {}),
  onReady: async pet => {
  const db = new DatabaseSync(petDatabasePath(directory));
  const state = (): Lifecycle => JSON.parse(String(db.prepare('SELECT snapshot FROM lifecycle').get()?.snapshot));
  const original = state();
  if (readinessMode) {
    if (mode !== 'ready-startup') {
      assert.equal(original.ready, false);
      assert.equal(BrowserWindow.getAllWindows().some(w => w.getTitle() === 'Jarvis Pet · 첫 만남'), false);
      eggNow += mode === 'ready-care' ? 900 : 1000;
      if (mode === 'ready-care') {
        await pet.webContents.executeJavaScript('window.petWindow.beginDrag(); window.petWindow.endDrag()');
        assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 1);
      } else {
        powerMonitor.emit('lock-screen'); powerMonitor.emit('suspend');
        // Resume advances elapsed time even while the lock remains in effect.
        powerMonitor.emit('resume');
      }
    }
    await until(async () => state().ready && BrowserWindow.getAllWindows().some(w => w.getTitle() === 'Jarvis Pet · 첫 만남' && !w.webContents.isLoading()));
    const prepared = state();
    assert.equal(prepared.completed, null); assert.equal(prepared.stage, 'egg');
    assert.equal(prepared.orbId, null); assert.equal(prepared.name, null); assert.equal(prepared.revision, 1);
    const waiting = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Jarvis Pet · 첫 만남')!;
    assert.equal(waiting.isVisible(), false);
    assert.equal((await waiting.webContents.executeJavaScript('window.hatch.read()')).available, false);
    powerMonitor.emit('unlock-screen'); powerMonitor.emit('resume');
    await pause();
    assert.deepEqual(state(), prepared);
    assert.equal(waiting.isVisible(), false);
    // Waiting for the user must not turn harmless egg care into a save error.
    await new Promise(resolve => setTimeout(resolve, 750));
    const count = Number(db.prepare('SELECT count(*) n FROM egg_care').get()?.n);
    await pet.webContents.executeJavaScript('window.petWindow.beginDrag(); window.petWindow.endDrag()');
    assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, count + 1);
    assert.deepEqual(state(), prepared);
    console.log(`HATCH_PRODUCT:${JSON.stringify(state())}`);
    db.close(); clearTimeout(timeout); app.quit(); return;
  }
  const win = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Jarvis Pet · 첫 만남');
  if (!win) {
    assert.ok(!original.ready || original.name !== null);
    const snapshot = await pet.webContents.executeJavaScript('window.petWindow.snapshot()');
    assert.equal(snapshot.petId, original.petId);
    assert.equal(snapshot.stage, original.stage);
    if (original.name !== null) {
      await until(() => pet.webContents.executeJavaScript('document.querySelector("#pet-name").textContent !== ""'));
      assert.equal(await pet.webContents.executeJavaScript('document.querySelector("#pet-name").textContent'), original.name);
      assert.equal(await pet.webContents.executeJavaScript('document.querySelector("#egg").classList.contains("baby-idle")'), true);
    }
  } else {
    assert.notEqual(win.webContents.session, pet.webContents.session);
    const run = <T = any>(script: string): Promise<T> => win.webContents.executeJavaScript(script);
    const read = () => run<HatchView>('window.hatch.read()');
    const handler = (channel: string, event: IpcMainInvokeEvent, ...args: unknown[]) => handlers.get(channel)!(event, ...args);
    assert.equal((await read()).available, false);
    assert.equal(state().revision, original.revision);
    // Observe production availability handlers without showing a window or
    // changing the user's foreground app, lock state, or OS cursor.
    let visible = true;
    let minimized = false;
    win.isVisible = () => visible;
    win.isMinimized = () => minimized;
    win.emit('show');
    const rendered = (step: string) => run<boolean>(`document.querySelector('#hatch').dataset.step === ${JSON.stringify(step)} && document.querySelector('#hatch').childElementCount > 0`);
    await until(() => rendered(nextHatchStep(state())));
    if (mode === 'exercise') {
      assert.deepEqual(await run('Object.keys(window.hatch).sort()'), ['name', 'read', 'subscribe', 'witness']);
      assert.equal(await run('typeof require'), 'undefined');
      assert.equal(await run('typeof window.ipcRenderer'), 'undefined');
      const trusted = trustedEvent!;
      const before = state();
      const view = await read();
      for (const channel of ['hatch:read', 'hatch:witness', 'hatch:name']) {
        assert.throws(() => handler(channel, { ...trusted, sender: pet.webContents }, ...[]), /HATCH_REQUEST_DENIED/);
        assert.throws(() => handler(channel, { ...trusted, senderFrame: { url: trusted.senderFrame!.url } } as IpcMainInvokeEvent), /HATCH_REQUEST_DENIED/);
      }
      assert.throws(() => handler('hatch:read', trusted, 'extra'), /HATCH_REQUEST_DENIED/);
      for (const args of [[view.state.revision, view.epoch, 'prelude', 'extra'],
        [-1, view.epoch, 'prelude'], [view.state.revision, NaN, 'prelude'],
        ['1', view.epoch, 'prelude'], [1, view.epoch, 'prepare'], [1, view.epoch, {}]]) {
        assert.throws(() => handler('hatch:witness', trusted, ...args), /HATCH_REQUEST_DENIED/);
      }
      assert.throws(() => handler('hatch:name', trusted, view.state.revision, view.epoch, {}), /HATCH_REQUEST_DENIED/);
      assert.throws(() => handler('hatch:name', trusted, view.state.revision, view.epoch, '이름'), /INVALID_HATCH_ORDER/);
      assert.deepEqual(state(), before);

      const foreign = new BrowserWindow({ show: false, webPreferences: {
        preload: path.join(__dirname, '../../src/preload/hatch.js'), sandbox: true, contextIsolation: true } });
      await foreign.loadFile(path.join(__dirname, '../../src/renderer/hatch.html'));
      assert.equal(await foreign.webContents.executeJavaScript('window.hatch.read().then(() => false, () => true)'), true);
      foreign.destroy();

      for (const scene of hatchScenes) {
        await until(() => rendered(scene));
        const saved = state();
        for (const kind of ['hide', 'minimize', 'lock', 'suspend']) {
          const prior = await read();
          await run('window.oldHatchButton = document.querySelector("#hatch button")');
          if (kind === 'hide') { visible = false; win.emit('hide'); }
          if (kind === 'minimize') { minimized = true; win.emit('minimize'); }
          if (kind === 'lock') powerMonitor.emit('lock-screen');
          if (kind === 'suspend') powerMonitor.emit('suspend');
          assert.equal((await read()).available, false);
          await run('window.oldHatchButton.click()');
          await assert.rejects(run(`window.hatch.witness(${saved.revision}, ${prior.epoch}, '${scene}')`), /HATCH_PAUSED/);
          assert.deepEqual(state(), saved);
          if (kind === 'hide') { visible = true; win.emit('show'); }
          if (kind === 'minimize') { minimized = false; win.emit('restore'); }
          if (kind === 'lock') powerMonitor.emit('unlock-screen');
          if (kind === 'suspend') powerMonitor.emit('resume');
          await until(() => rendered(scene));
          await assert.rejects(run(`window.hatch.witness(${saved.revision}, ${prior.epoch}, '${scene}')`), /HATCH_PAUSED/);
          assert.deepEqual(state(), saved);
        }
        if (scene === 'baby') {
          db.exec("CREATE TRIGGER fail_scene BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
          await run('document.querySelector("#hatch button").click()');
          await until(() => run('document.querySelector("#hatch [role=alert]").textContent.includes("저장하지 못")'));
          assert.deepEqual(state(), saved);
          assert.equal(db.prepare('SELECT stage FROM pet').get()?.stage, 'egg');
          db.exec('DROP TRIGGER fail_scene');
        }
        await run('document.querySelector("#hatch button").click(); document.querySelector("#hatch button").click()');
        await until(async () => state().revision === saved.revision + 1);
        assert.equal(state().petId, original.petId);
      }
      await until(() => rendered('naming'));
      const nameView = await read();
      for (const name of ['', '   ', '가'.repeat(21), '별\n이']) {
        await assert.rejects(run(`window.hatch.name(${nameView.state.revision}, ${nameView.epoch}, ${JSON.stringify(name)})`), /INVALID_NAME/);
        assert.equal(state().name, null);
      }
      await run('document.querySelector("input").value = "별"');
      powerMonitor.emit('lock-screen'); await read(); await pause();
      powerMonitor.emit('unlock-screen'); await until(() => rendered('naming'));
      assert.equal(await run('document.querySelector("input").value'), '별');
      db.exec("CREATE TRIGGER fail_name BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
      await run('document.querySelector("input").value=" 별 "; document.querySelector("form").requestSubmit()');
      await until(() => run('document.querySelector("form [role=alert]").textContent.includes("저장하지 못")'));
      assert.equal(state().name, null);
      assert.equal(await run('document.querySelector("input").value'), ' 별 ');
      assert.equal(await run('document.activeElement.name'), 'pet-name');
      assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
      writeFileSync(path.join(tmpdir(), 'jarvis-product-name-failure.png'), (await win.webContents.capturePage()).toPNG());
      db.exec('DROP TRIGGER fail_name');
      await run('document.querySelector("form").requestSubmit()');
      await until(() => pet.webContents.executeJavaScript('document.querySelector("#pet-name").textContent === "별"'));
      assert.equal(state().name, '별');
      assert.equal((await pet.webContents.executeJavaScript('window.petWindow.snapshot()')).petId, original.petId);
      writeFileSync(path.join(tmpdir(), 'jarvis-product-baby-idle.png'), (await pet.webContents.capturePage()).toPNG());
      const count = db.prepare('SELECT count(*) n FROM egg_care').get()?.n;
      await pet.webContents.executeJavaScript('window.petWindow.beginDrag(); window.petWindow.endDrag()');
      assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, count);
      assert.equal((await pet.webContents.executeJavaScript('window.petBrain.read()')).behavior, 'idle');
      const originalCursor = screen.getCursorScreenPoint;
      let cursor = { x: 500, y: 500 };
      screen.getCursorScreenPoint = () => cursor;
      try {
        pet.setPosition(400, 400);
        const origin = pet.getPosition();
        await pet.webContents.executeJavaScript('window.petWindow.beginDrag(); window.petWindow.snapshot()');
        await new Promise(resolve => setTimeout(resolve, 380));
        cursor = { x: 520, y: 500 };
        await pet.webContents.executeJavaScript('window.petWindow.moveDrag(); window.petWindow.endDrag()');
        assert.notDeepEqual(pet.getPosition(), origin);
        assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, count);
      } finally { screen.getCursorScreenPoint = originalCursor; }
      // A real navigation to a non-local page must fail even with the correct window/preload.
      await win.loadURL('data:text/html,<html></html>');
      assert.equal(await run('window.hatch.read().then(() => false, () => true)'), true);
    } else if (mode === 'step') {
      const step = nextHatchStep(state());
      if (step === 'naming') await run('document.querySelector("input").value="별"; document.querySelector("form").requestSubmit()');
      else await run('document.querySelector("#hatch button").click()');
      await until(async () => state().revision === original.revision + 1);
    }
  }
  console.log(`HATCH_PRODUCT:${JSON.stringify(state())}`);
  db.close(); clearTimeout(timeout); app.quit();
}, onFailure: code => { console.error(`HATCH_PRODUCT_FAILED:${code}`); } });
require('../../src/main/index');
