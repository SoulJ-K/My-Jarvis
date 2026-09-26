import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { petDatabasePath } from '../src/storage/pet-repository';
import { hatchScenes } from '../src/pet/lifecycle';

const dir = mkdtempSync(path.join(tmpdir(), 'jarvis-hatch-ui-'));
app.setPath('userData', dir); app.on('window-all-closed', () => {});
const timeout = setTimeout(() => app.exit(2), 30000);
app.whenReady().then(async () => {
  app.dock?.hide();
  const store = new LifecycleRepository(dir, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
  const db = new DatabaseSync(petDatabasePath(dir));
  const win = new BrowserWindow({ show: false, width: 420, height: 560, webPreferences: {
    preload: path.join(__dirname, 'fixtures/hatch-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false,
  } });
  ipcMain.handle('hatch-test:read', () => store.read());
  ipcMain.handle('hatch-test:apply', (_event, revision, command) => store.apply(revision, command));
  await win.loadURL('data:text/html,<html lang="ko"><head><meta charset="utf-8"></head><body><main id="hatch"></main></body></html>');
  const run = (script: string) => win.webContents.executeJavaScript(script);
  await win.webContents.insertCSS(readFileSync(path.join(__dirname, '../../src/renderer/hatch-sequence.css'), 'utf8'));
  for (const file of ['NamePrompt', 'HatchSequence']) await run(readFileSync(path.join(__dirname, `../src/renderer/${file}.js`), 'utf8'));
  await run('window.sequence = new JarvisHatch.HatchSequence(document.querySelector("#hatch"), window.hatchTest); window.sequence.setAvailable(true)');
  assert.equal(await run('document.querySelector("#hatch").dataset.step'), 'egg');
  assert.equal(await run('document.querySelectorAll("button").length'), 0);
  store.apply(0, { type: 'prepare' });
  await run('window.sequence.setAvailable(true)');
  const settle = () => run('new Promise(resolve => setTimeout(resolve, 60))');
  for (const scene of hatchScenes) {
    assert.equal(await run('document.querySelector("#hatch").dataset.step'), scene);
    const revision = store.read().revision;
    // Lock/suspend/hide simulation. It must not complete the current scene, even
    // if a detached old button's callback arrives later.
    await run('window.oldButton = document.querySelector("button"); window.sequence.setAvailable(false)');
    await run('window.oldButton.click(); document.dispatchEvent(new Event("visibilitychange"))');
    await settle(); assert.equal(store.read().revision, revision);
    assert.equal(await run('document.querySelector("#hatch").childElementCount'), 0);
    await run('window.sequence.setAvailable(true)');
    assert.equal(await run('document.querySelector("#hatch").dataset.step'), scene);
    await run('document.querySelector("button").click(); document.querySelector("button").click()');
    await settle(); assert.equal(store.read().revision, revision + 1);
  }
  assert.equal(await run('document.querySelector("#hatch").dataset.step'), 'naming');
  assert.equal(await run('document.activeElement.name'), 'pet-name');
  await run(`document.querySelector('input').value='별'; document.querySelector('input').dispatchEvent(new CompositionEvent('compositionstart')); document.querySelector('form').requestSubmit()`);
  await settle(); assert.equal(store.read().name, null);
  await run(`document.querySelector('input').dispatchEvent(new CompositionEvent('compositionend')); document.querySelector('form').requestSubmit()`);
  assert.equal(store.read().name, null);
  await run('new Promise(resolve => setTimeout(resolve,120))');
  db.exec("CREATE TRIGGER fail_name BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
  await run('document.querySelector("form").requestSubmit()'); await settle();
  assert.equal(store.read().name, null);
  assert.equal(await run('document.querySelector("input").value'), '별');
  assert.match(await run('document.querySelector("form [role=alert]").textContent'), /저장하지 못/);
  const screenshot = path.join(tmpdir(), 'jarvis-hatch-name-failure.png');
  writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
  db.exec('DROP TRIGGER fail_name');
  await run(`(() => { const input=document.querySelector('input'); input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.dispatchEvent(new CompositionEvent('compositionend')); const button=document.querySelector('form button');
    button.dispatchEvent(new PointerEvent('pointerdown')); document.querySelector('form').requestSubmit(button); })()`); await settle();
  assert.equal(store.read().name, '별');
  assert.equal(await run('document.querySelector("#hatch").dataset.step'), 'life');
  await run('window.sequence.setAvailable(false); window.sequence.setAvailable(true)');
  assert.equal(await run('document.querySelectorAll("input").length'), 0);
  assert.equal(await run('typeof require'), 'undefined');
  assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
  console.log('PASS: witnessed scene order, pause/resume at all scenes, stale/double clicks, IME guard, failed name retry, committed baby state, isolated browser');
  console.log(`SCREENSHOT:${screenshot}`);
  await run('window.sequence.dispose()'); win.destroy(); db.close(); store.close();
  clearTimeout(timeout); rmSync(dir, { recursive: true, force: true }); app.quit();
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
