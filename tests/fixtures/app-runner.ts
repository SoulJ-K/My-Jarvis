import { app, BrowserWindow, screen } from 'electron';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { petDatabasePath } from '../../src/storage/pet-repository';
import { mkdirSync, writeFileSync } from 'node:fs';
const lifecycle = require('../../src/main/app') as typeof import('../../src/main/app');
const startJarvis = lifecycle.startJarvis;

// Only this test entry point accepts an alternate store. Production has no such switch.
const [directory, mode] = process.argv.slice(2);
if (!directory || !['once', 'hold', 'exercise', 'react-hold', 'care', 'renderer-crash'].includes(mode)) throw new Error('Invalid test arguments');
app.setPath('userData', directory);
const timeout = setTimeout(() => app.exit(2), 20_000);

async function inspect(win: BrowserWindow) {
  return win.webContents.executeJavaScript(`(async () => ({
    snapshot: await window.petWindow.snapshot(),
    state: await window.petBrain.read(),
    rendered: document.querySelector('#egg').dataset.petId,
    behavior: document.querySelector('#egg').dataset.behavior,
    reacting: document.querySelector('#egg').classList.contains('reacting')
  }))()`);
}

async function clickEgg(win: BrowserWindow) {
  // Electron routes mouse events through the real page pointer handlers/preload/Brain.
  // This does not move the user's OS cursor or click another application.
  await win.webContents.executeJavaScript(`window.testReaction = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('click did not reach Brain')); }, 3000);
    const unsubscribe = window.petBrain.subscribe(state => {
      if (state.behavior !== 'reacting') return;
      clearTimeout(timer); unsubscribe(); resolve(state);
    });
  }); void 0;`);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 90, y: 95, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 90, y: 95, button: 'left', clickCount: 1 });
  await win.webContents.executeJavaScript('window.testReaction');
  return inspect(win);
}

async function exerciseCare(win: BrowserWindow) {
  const db = new DatabaseSync(petDatabasePath(directory));
  const originalCursor = screen.getCursorScreenPoint;
  let cursor = { x: 500, y: 500 };
  screen.getCursorScreenPoint = () => ({ ...cursor });
  const count = () => Number(db.prepare('SELECT count(*) AS n FROM egg_care').get()?.n);
  const state = () => win.webContents.executeJavaScript('window.petBrain.read()');
  const input = async (type: 'mouseDown' | 'mouseMove' | 'mouseUp', x = 90) => {
    const pointer = { mouseDown: 'pointerdown', mouseMove: 'pointermove', mouseUp: 'pointerup' }[type];
    await win.webContents.executeJavaScript(`window.testPointer = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('missing ${pointer}')), 2000);
      window.addEventListener('${pointer}', () => { clearTimeout(timer); resolve(); }, { once: true });
    }); void 0;`);
    win.webContents.sendInputEvent({ type, x, y: 95, button: 'left', clickCount: 1 });
    await win.webContents.executeJavaScript('window.testPointer');
    await state(); // Renderer → main round trip orders the real pointer handlers.
  };
  const idle = () => win.webContents.executeJavaScript(`(async () => {
    if ((await window.petBrain.read()).behavior === 'idle') return;
    await new Promise(resolve => {
      const off = window.petBrain.subscribe(s => { if (s.behavior === 'idle') { off(); resolve(); } });
    });
  })()`);
  const hold = async () => {
    cursor = { x: 500, y: 500 };
    await input('mouseDown');
    await new Promise(resolve => setTimeout(resolve, 390));
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('#egg').classList.contains('stroking')"), true);
  };
  try {
    win.setPosition(400, 400);
    const origin = win.getPosition();
    await hold();
    cursor.x = 512; await input('mouseMove', 102);
    cursor.x = 500; await input('mouseMove');
    await input('mouseUp');
    assert.equal((await state()).behavior, 'soothed');
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('#egg').classList.contains('soothed')"), true);
    assert.deepEqual(win.getPosition(), origin);
    assert.equal(count(), 1);
    mkdirSync('.local', { recursive: true });
    writeFileSync('.local/egg-care-preview.png', (await win.webContents.capturePage()).toPNG());
    await idle();

    // The main process samples OS cursor movement while the egg is held.
    // A coalesced or missing renderer pointermove must not lose a real stroke.
    await hold();
    cursor.x = 512; await new Promise(resolve => setTimeout(resolve, 55));
    cursor.x = 500; await new Promise(resolve => setTimeout(resolve, 55));
    await input('mouseUp');
    assert.equal((await state()).behavior, 'soothed');
    assert.equal(count(), 2);
    await idle();

    // Immediate drag remains a move even when it returns to its starting point.
    await input('mouseDown');
    cursor.x = 520; await input('mouseMove', 110);
    assert.notDeepEqual(win.getPosition(), origin);
    cursor.x = 500; await input('mouseMove');
    await input('mouseUp');
    assert.deepEqual(win.getPosition(), origin);
    assert.equal(count(), 2);
    assert.equal((await state()).behavior, 'idle');

    await hold();
    cursor.x = 512; await input('mouseMove', 102);
    cursor.x = 500; await input('mouseMove');
    await win.webContents.executeJavaScript("document.querySelector('#egg').dispatchEvent(new PointerEvent('pointercancel')); void 0;");
    await input('mouseUp');
    assert.equal(count(), 2);

    await hold();
    cursor.x = 610; await input('mouseMove', 170);
    await input('mouseUp', 170);
    assert.equal(count(), 2);
    assert.deepEqual(win.getPosition(), origin);
    cursor.x = 500;

    // Reload while pressed must discard the gesture and its armed cue.
    await input('mouseDown');
    const loaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
    win.webContents.reload(); await loaded;
    await win.webContents.executeJavaScript('window.petWindow.endDrag()');
    assert.equal(count(), 2);

    db.exec("CREATE TRIGGER fail_care BEFORE INSERT ON egg_care BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const before = db.prepare('SELECT * FROM egg_life').get();
    await input('mouseDown'); await input('mouseUp');
    assert.equal((await state()).behavior, 'idle');
    assert.equal(count(), 2);
    assert.deepEqual(db.prepare('SELECT * FROM egg_life').get(), before);
    assert.match(await win.webContents.executeJavaScript("document.querySelector('#save-status').textContent"), /저장하지 못/);
    writeFileSync('.local/egg-save-failure-preview.png', (await win.webContents.capturePage()).toPNG());
    db.exec('DROP TRIGGER fail_care');
    await input('mouseDown'); await input('mouseUp');
    assert.equal((await state()).behavior, 'reacting');
    assert.equal(count(), 3);
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('#save-status').textContent"), '');
    await win.webContents.executeJavaScript('window.petWindow.endDrag()');
    assert.equal(count(), 3);
    await idle();
    return { kinds: db.prepare('SELECT kind FROM egg_care ORDER BY id').all().map(row => row.kind),
      life: db.prepare('SELECT elapsed_ms, observed_at_ms FROM egg_life').get(),
      state: await state() };
  } catch (error) { console.error(error); throw error; }
  finally { screen.getCursorScreenPoint = originalCursor; db.close(); }
}

// Exercise the production entry; override only test presentation/callbacks.
lifecycle.startJarvis = () => startJarvis({
  show: false,
  onReady: async win => {
    const initial = await inspect(win);
    if (mode === 'renderer-crash') {
      const windowId = win.id;
      const windowCount = BrowserWindow.getAllWindows().length;
      for (let attempt = 0; attempt < 2; attempt++) {
        const loaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
        win.webContents.forcefullyCrashRenderer();
        await loaded;
        assert.equal(win.id, windowId);
        assert.equal(BrowserWindow.getAllWindows().length, windowCount);
        assert.deepEqual((await inspect(win)).snapshot, initial.snapshot);
      }
      const gone = new Promise<void>(resolve => win.webContents.once('render-process-gone', () => resolve()));
      win.webContents.forcefullyCrashRenderer();
      await gone;
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.equal(win.webContents.isCrashed(), true, 'third immediate crash must not auto-reload forever');
      assert.equal(BrowserWindow.getAllWindows().length, windowCount);
      const loaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
      app.emit('second-instance'); // Deliberate second launch requests the existing tray reset path.
      await loaded;
      assert.equal(win.id, windowId);
      assert.equal(BrowserWindow.getAllWindows().length, windowCount);
      assert.deepEqual((await inspect(win)).snapshot, initial.snapshot);
      console.log(`TEST_READY:${JSON.stringify({ snapshot: initial.snapshot, windows: windowCount })}`);
      clearTimeout(timeout);
      app.quit();
      return;
    }
    let exercise: unknown;
    if (mode === 'exercise' || mode === 'react-hold') {
      const clicked = await clickEgg(win);
      if (mode === 'react-hold') exercise = { initial, clicked };
      else {
        const loaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
        win.webContents.reload();
        await loaded;
        const reloaded = await inspect(win);
        await win.webContents.executeJavaScript(`(async () => {
          let unsubscribe;
          const idle = new Promise(resolve => {
            unsubscribe = window.petBrain.subscribe(next => { if (next.behavior === 'idle') resolve(); });
          });
          if ((await window.petBrain.read()).behavior !== 'idle') await idle;
          unsubscribe();
        })()`);
        const rested = await inspect(win);
        exercise = { initial, clicked, reloaded, rested };
      }
    }
    if (mode === 'care') exercise = await exerciseCare(win);
    console.log(`TEST_READY:${JSON.stringify({ ...initial, exercise })}`);
    if (mode === 'once' || mode === 'exercise' || mode === 'care') {
      clearTimeout(timeout);
      app.quit();
    }
  },
  onFailure: code => console.log(`TEST_FAILURE:${JSON.stringify({ code, windows: BrowserWindow.getAllWindows().length })}`),
});
require('../../src/main/index');
process.on('SIGTERM', () => { clearTimeout(timeout); app.quit(); });
