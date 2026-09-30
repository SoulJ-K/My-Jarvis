import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain, screen, powerMonitor, type IpcMainInvokeEvent } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { SOCIAL_TIMING as T } from '../src/pet/baby-social';
import { petDatabasePath } from '../src/storage/pet-repository';
const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-social-ui-'));
app.setPath('userData', directory);
app.on('quit', () => rmSync(directory, { recursive: true, force: true }));
let now = 1_000_000;
Date.now = () => now;
const lifecycle = new LifecycleRepository(directory, { namePolicy: { trim: true, maxCodePoints: 20 }, developmentTrigger: true });
let stage = lifecycle.apply(0, { type: 'prepare' });
for (const scene of hatchScenes) stage = lifecycle.apply(stage.revision, { type: 'witness', scene });
lifecycle.apply(stage.revision, { type: 'name', name: '별' }); lifecycle.close();
new BabyLifeRepository(directory, () => now).close();
const timeout = setTimeout(() => app.exit(2), 30000);
let submitEvent: IpcMainInvokeEvent;
let submitHandler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => {
  if (channel === 'timer:submit') {
    submitHandler = listener;
    register(channel, (event, ...args) => { submitEvent = event; return listener(event, ...args); });
  } else register(channel, listener);
};
const pause = () => new Promise(resolve => setTimeout(resolve, 30));
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause(); }
  throw new Error('SOCIAL_UI_DID_NOT_SETTLE');
}
const startup = require('../src/main/app') as typeof import('../src/main/app');
const start = startup.startJarvis;
startup.startJarvis = () => start({ show: false, onReady: async win => {
  try {
    const pet = (script: string) => win.webContents.executeJavaScript(script);
    const prompt = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/prompt.html'))!;
    const run = (script: string) => prompt.webContents.executeJavaScript(script);
    const submit = (input: string) => run(`window.timerPanel.submit(crypto.randomUUID(), ${JSON.stringify(input)})`);
    const db = new DatabaseSync(petDatabasePath(directory));
    const count = () => db.prepare('SELECT COUNT(*) AS n FROM baby_social_experience').get()!.n;
    const capture = async (name: string) => {
      await pet('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      writeFileSync(path.join(tmpdir(), `jarvis-social-${name}.png`), (await win.webContents.capturePage()).toPNG());
    };
    // Drive the existing form, including IME guard, without focusing or showing any window.
    await run(`document.querySelector('#request').value='잘했어'; document.querySelector('#request').dispatchEvent(new CompositionEvent('compositionstart')); document.querySelector('#timer-form').requestSubmit()`);
    await pause(); assert.equal(count(), 0);
    await run(`document.querySelector('#request').dispatchEvent(new CompositionEvent('compositionend'))`);
    await new Promise(resolve => setTimeout(resolve, 130));
    await run(`document.querySelector('#timer-form').requestSubmit()`);
    await until(() => pet('document.querySelector("#egg").dataset.social === "bounce"'));
    assert.equal(count(), 1);
    assert.equal(await pet('document.querySelector("#emotion-orb").dataset.orbId'), `${stage.petId}:orb`);
    await capture('joy');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await pet('getComputedStyle(document.querySelector(".shell")).animationName'), 'none');
    win.webContents.debugger.detach();
    for (const args of [[], ['id'], ['id', {}], ['id', 'x'.repeat(81)], ['id','안녕','extra']]) {
      assert.throws(() => submitHandler(submitEvent, ...args), /DENIED|FAILED/);
    }
    for (const event of [{ ...submitEvent, sender: win.webContents }, { ...submitEvent, senderFrame: { url: submitEvent.senderFrame!.url } }]) {
      assert.throws(() => submitHandler(event as IpcMainInvokeEvent, 'id', '잘했어'), /DENIED/);
    }
    const saved = count();
    assert.equal((await submit('잘했어 파일 지워')).ok, false); assert.equal(count(), saved);
    assert.equal((await submit('안녕')).ok, true); assert.equal(count(), saved);
    now += T.praise;
    db.exec("CREATE TRIGGER fail_social BEFORE INSERT ON baby_social_experience BEGIN SELECT RAISE(ABORT,'test'); END");
    assert.equal(await run(`window.timerPanel.submit('fail','잘했어').then(()=>false,()=>true)`), true);
    assert.equal(count(), saved);
    db.exec('DROP TRIGGER fail_social');
    assert.equal((await submit('잘했어')).ok, true);
    // Fake visibility and cursor only in this isolated process; OS cursor is never moved.
    win.isVisible = () => true;
    screen.getCursorScreenPoint = () => ({ x: win.getBounds().x + 30, y: win.getBounds().y + 120 });
    now += T.emotion;
    await until(() => pet('document.querySelector("#egg").dataset.social === "chase"'));
    assert.equal(await pet('document.querySelector("#egg").dataset.direction'), 'left');
    await capture('cursor');
    screen.getCursorScreenPoint = () => ({ x: -10000, y: -10000 });
    await until(() => pet('document.querySelector("#egg").dataset.social !== "chase"'));
    now += T.playGap;
    assert.equal((await submit('구슬 놀이')).ok, true);
    await until(() => pet('document.querySelector("#emotion-orb").dataset.play === "true"'));
    await capture('orb');
    assert.equal((await submit('그만')).ok, true);
    await until(() => pet('document.querySelector("#emotion-orb").hidden'));
    now += T.playGap;
    await submit('구슬 놀이');
    powerMonitor.emit('lock-screen');
    await until(() => pet('document.querySelector("#emotion-orb").hidden'));
    now += T.playGap; powerMonitor.emit('resume');
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(await pet('document.querySelector("#emotion-orb").hidden'), true);
    powerMonitor.emit('unlock-screen');
    await until(() => pet('document.querySelector("#emotion-orb").dataset.play === "true" && !document.querySelector("#emotion-orb").hidden'));
    await submit('그만');
    for (let i = 0; i < 3; i++) await pet('(async()=>{ window.petWindow.beginDrag(); await window.petWindow.endDrag(); })()');
    // Prompt display/focus methods are disabled globally in this isolated test.
    await until(() => pet('document.querySelector("#egg").dataset.social === "away"'));
    await capture('away');
    assert.equal(await pet('document.documentElement.scrollWidth <= innerWidth'), true);
    // A sleeping/distancing pet cannot delay the independent five-minute deadline.
    assert.equal((await submit('5분 타이머')).ok, true);
    powerMonitor.emit('suspend'); now += 300001; powerMonitor.emit('resume');
    assert.equal((await run('window.timerPanel.read()'))[0].status, 'due');
    now += T.recovery;
    await until(() => pet('document.querySelector("#egg").dataset.social !== "away"'));
    // Drive the actual pet button while the separate input panel is already open.
    // A press is visual feedback; only the completed, unmoved gesture is contact.
    let opens = 0;
    let promptVisible = false;
    let promptFocused = false;
    prompt.show = () => { opens++; promptVisible = true; };
    prompt.focus = () => { promptFocused = true; };
    prompt.isVisible = () => promptVisible;
    prompt.isFocused = () => promptFocused;
    prompt.blur = () => { promptFocused = false; };
    prompt.hide = () => { promptVisible = false; };
    await run('window.openSignals = 0; void window.timerPanel.onOpen(() => { window.openSignals++; })');
    const touches = () => JSON.parse(String(db.prepare('SELECT snapshot FROM baby_social').get()!.snapshot)).touches as number;
    now += T.touchWindow + 1;
    await until(() => Promise.resolve(touches() === 0));
    const experiencesBeforeClicks = Number(count());
    screen.getCursorScreenPoint = () => ({ x: win.getBounds().x + 90, y: win.getBounds().y + 120 });
    const clickPet = async (expectedTouches: number) => {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 90, y: 120 });
      win.webContents.sendInputEvent({ type: 'mouseDown', x: 90, y: 120, button: 'left', clickCount: 1 });
      await until(() => pet('document.querySelector("#egg").classList.contains("pressed")'));
      win.webContents.sendInputEvent({ type: 'mouseUp', x: 90, y: 120, button: 'left', clickCount: 1 });
      await until(() => Promise.resolve(touches() === expectedTouches));
    };
    await clickPet(1);
    assert.equal(opens, 1);
    assert.notEqual(await pet('document.querySelector("#egg").dataset.social'), 'away');
    await run('document.querySelector("#request").focus(); document.querySelector("#submit").click()');
    assert.equal(touches(), 1, 'input field and button are separate from pet contact');
    await clickPet(2);
    await clickPet(3);
    assert.equal(opens, 1, 'a visible input panel is not reopened on further pet clicks');
    assert.equal(count(), experiencesBeforeClicks + 1, 'one completed repeat creates one social experience');
    await until(() => pet('document.querySelector("#egg").dataset.social === "away"'));
    let dragCursor = { x: win.getBounds().x + 90, y: win.getBounds().y + 120 };
    screen.getCursorScreenPoint = () => dragCursor;
    await pet('window.petWindow.beginDrag()');
    dragCursor = { x: dragCursor.x + 20, y: dragCursor.y + 10 };
    await pet('window.petWindow.moveDrag()');
    assert.equal(await pet('window.petWindow.endDrag()'), true);
    assert.equal(touches(), 3, 'dragging the baby is not another contact');
    assert.equal(count(), experiencesBeforeClicks + 1);
    // A panel behind another app is still visible to Electron. Re-focus it
    // without replaying the opening event or changing the draft/caret.
    await run(`document.querySelector('#request').value='작성 중인 부탁';
      document.querySelector('#request').focus(); document.querySelector('#request').setSelectionRange(1, 3)`);
    const openingSignals = await run('window.openSignals');
    promptFocused = false;
    await clickPet(3);
    await pause();
    assert.equal(promptFocused, true, 'pet click brings a visible but unfocused prompt forward');
    assert.equal(opens, 2);
    assert.equal(await run('window.openSignals'), openingSignals);
    assert.deepEqual(await run(`(() => { const input=document.querySelector('#request');
      return [input.value, input.selectionStart, input.selectionEnd]; })()`), ['작성 중인 부탁', 1, 3]);
    await run('window.timerPanel.close()');
    await until(() => run('document.querySelector("#request").value === ""'));
    await clickPet(3);
    await until(() => run(`window.openSignals === ${openingSignals + 1}`));
    assert.equal(opens, 3, 'explicitly closed prompt can be opened again');
    assert.equal(promptVisible, true);
    assert.equal(promptFocused, true);
    db.close(); clearTimeout(timeout);
    console.log('PASS: production baby input/IME, exact grammar, minimal experience, failed save/retry, IPC sender/frame/arguments, same orb, cursor departure, orb/stop, space/recovery, timer independence, screenshots');
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
}, onFailure: () => app.exit(1) });
// No actual visible input window or focus change during the test.
BrowserWindow.prototype.show = function () {};
BrowserWindow.prototype.focus = function () {};
require('../src/main/index');
