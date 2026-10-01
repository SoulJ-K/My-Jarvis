import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, screen, type BrowserWindow } from 'electron';
import { createPetWindow, initialPosition } from '../src/main/windows';
import { loadOrCreateEgg } from '../src/storage/pet-repository';

// Isolated, hidden Electron window. No OS cursor movement or other-app input.
const data = mkdtempSync(path.join(tmpdir(), 'jarvis-window-check-'));
app.setName('Jarvis Window Checks');
app.setPath('userData', data);
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(data, { recursive: true, force: true }));
const deadline = setTimeout(() => app.exit(1), 20_000);

async function request(win: BrowserWindow, code: string) {
  // Invoke after sends is an IPC ordering barrier, without a timing sleep.
  return win.webContents.executeJavaScript(`(async () => {
    ${code}
    return await window.petWindow.snapshot();
  })()`);
}

app.whenReady().then(async () => {
  app.dock?.hide();
  const baseListeners = ['display-removed', 'display-metrics-changed'].map(name => screen.listenerCount(name));
  const win = await createPetWindow(loadOrCreateEgg(data), false);
  const originalCursor = screen.getCursorScreenPoint.bind(screen);
  let cursor = { x: 400, y: 400 };
  screen.getCursorScreenPoint = () => cursor;
  const originalIgnore = win.setIgnoreMouseEvents.bind(win);
  const ignores: boolean[] = [];
  win.setIgnoreMouseEvents = (ignore, options) => {
    assert.equal(options?.forward, true);
    ignores.push(ignore);
    originalIgnore(ignore, options);
  };
  const errors: string[] = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level === 3) errors.push(message);
  });
  assert.equal(win.isFocusable(), false);
  assert.equal(win.isFocused(), false);
  assert.equal(win.isVisible(), false);

  // Real renderer hit testing, including the rounded button's empty corners.
  for (const [x, y, hit] of [
    [90, 95, true], [39, 29, false], [141, 29, false],
    [44, 95, false], [90, 49, false], [90, 169, false],
    [39, 167, false], [141, 167, false], [90, 185, false],
  ] as const) {
    await request(win, `document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))`);
    ignores.length = 0;
    await request(win, `window.dispatchEvent(new PointerEvent('pointermove', {clientX:${x}, clientY:${y}}))`);
    assert.deepEqual(ignores, hit ? [false] : [], `hit ${x},${y}`);
  }
  console.log('PASS: actual renderer center/corners/background hit testing; non-focusable hidden window');

  // Native setPosition/getPosition on the current display, with only cursor input substituted.
  const area = screen.getPrimaryDisplay().workArea;
  win.setPosition(area.x + 80, area.y + 80, false);
  const origin = win.getPosition();
  cursor = { x: area.x + 170, y: area.y + 175 };
  await request(win, 'window.petWindow.beginDrag()');
  cursor = { x: cursor.x + 3, y: cursor.y + 4 };
  await request(win, 'window.petWindow.moveDrag()');
  assert.deepEqual(win.getPosition(), origin, '5 DIP stays below the drag threshold');
  cursor = { x: area.x + 176, y: area.y + 175 };
  await request(win, 'window.petWindow.moveDrag()');
  assert.deepEqual(win.getPosition(), [origin[0] + 6, origin[1]], '6 DIP starts movement');
  cursor = { x: area.x + 200, y: area.y + 195 };
  await request(win, 'window.petWindow.moveDrag(); window.petWindow.hover(false)');
  assert.deepEqual(win.getPosition(), [origin[0] + 30, origin[1] + 20]);
  assert.equal(ignores.at(-1), false, 'drag keeps receiving the pointer outside the egg');
  assert.equal(await win.webContents.executeJavaScript('window.petWindow.endDrag()'), true);
  assert.equal(ignores.at(-1), true);
  assert.equal((await win.webContents.executeJavaScript('window.petBrain.read()')).behavior, 'idle');
  console.log('PASS: native hidden-window movement, threshold, drag capture policy, no click reaction after moving');

  // Deliver actual Chromium mouse events through the existing renderer handlers.
  // Only the main-process OS cursor reader is substituted; no OS mouse is moved.
  await request(win, `window.nativeInputSeen = 0; window.addEventListener('pointerdown', () => window.nativeInputSeen++, { once: true })`);
  win.setIgnoreMouseEvents(false, { forward: true });
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 10, y: 10, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 10, y: 10, button: 'left', clickCount: 1 });
  await request(win, '');
  const nativeInputSeen = await win.webContents.executeJavaScript('window.nativeInputSeen');
  win.setIgnoreMouseEvents(true, { forward: true });
  if (nativeInputSeen) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 90, y: 95 });
    win.webContents.sendInputEvent({ type: 'mouseDown', x: 90, y: 95, button: 'left', clickCount: 1 });
    await request(win, '');
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('#egg').classList.contains('pressed')"), true);
    cursor = { x: cursor.x + 20, y: cursor.y + 10 };
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 110, y: 105, button: 'left' });
    await request(win, '');
    win.webContents.sendInputEvent({ type: 'mouseUp', x: 110, y: 105, button: 'left', clickCount: 1 });
    await request(win, '');
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('#egg').classList.contains('pressed')"), false);
    assert.equal((await win.webContents.executeJavaScript('window.petBrain.read()')).behavior, 'idle');
    await request(win, `window.dispatchEvent(new PointerEvent('pointermove', {clientX: 10, clientY: 10}))`);
    assert.equal(ignores.at(-1), true);
    console.log('PASS: Chromium mouse down/move/up through renderer, pressed release and background click-through request');
  } else console.log('SKIP: this hidden Electron window did not receive sendInputEvent; native pointer delivery needs integration check');

  // Synthetic displays test DIP arithmetic, not native multi-monitor behavior.
  const originalNearest = screen.getDisplayNearestPoint.bind(screen);
  const originalMatching = screen.getDisplayMatching.bind(screen);
  const originalPosition = win.getPosition.bind(win);
  const originalSetPosition = win.setPosition.bind(win);
  const originalBounds = win.getBounds.bind(win);
  let position = { x: 300, y: 200 };
  let display = { ...screen.getPrimaryDisplay(), workArea: { x: 0, y: 24, width: 1000, height: 700 }, scaleFactor: 1 };
  screen.getDisplayNearestPoint = point => {
    assert.deepEqual(point, cursor, 'destination display follows the OS cursor');
    return display;
  };
  screen.getDisplayMatching = () => display;
  win.getPosition = () => [position.x, position.y];
  win.getBounds = () => ({ ...position, width: 180, height: 200 });
  win.setPosition = (x, y) => { position = { x, y }; };
  for (const [target, expected] of [
    [{ x: -1000, y: -1000 }, { x: 0, y: 24 }],
    [{ x: 3000, y: 3000 }, { x: 820, y: 524 }],
    [{ x: 3000, y: -1000 }, { x: 820, y: 24 }],
    [{ x: -1000, y: 3000 }, { x: 0, y: 524 }],
  ]) {
    position = { x: 300, y: 200 };
    cursor = { x: 390, y: 295 };
    await request(win, 'window.petWindow.beginDrag()');
    cursor = target;
    await request(win, 'window.petWindow.moveDrag()');
    assert.deepEqual(position, expected);
    assert.equal(await win.webContents.executeJavaScript('window.petWindow.endDrag()'), true);
  }
  for (const scaleFactor of [1, 1.25, 2]) {
    position = { x: 300, y: 200 };
    cursor = { x: 390, y: 295 };
    await request(win, 'window.petWindow.beginDrag()');
    display = { ...display, workArea: { x: -1280, y: -900, width: 1280, height: 876 }, scaleFactor };
    cursor = { x: -700, y: -400 };
    await request(win, 'window.petWindow.moveDrag()');
    assert.deepEqual(position, { x: -790, y: -495 }, 'DIP movement must not multiply by scaleFactor');
    await request(win, 'window.petWindow.cancelDrag()');
  }
  console.log('PASS: simulated four edges, negative display origins, 1/1.25/2 scale DIP coordinates');

  // Reproduction: a reloaded page has no active pointer but main previously kept the drag.
  await request(win, 'window.petWindow.beginDrag()');
  ignores.length = 0;
  const reloaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
  win.webContents.reload();
  await reloaded;
  await request(win, '');
  assert.equal(ignores.at(-1), true, 'reload must restore click-through');
  assert.equal(await win.webContents.executeJavaScript('window.petWindow.endDrag()'), true,
    'reload must cancel the old gesture, not turn it into a touch');
  assert.equal((await win.webContents.executeJavaScript('window.petBrain.read()')).behavior, 'idle');
  console.log('PASS: reload during drag releases click-through and cancels stale gesture');

  // Reproduction: after an external monitor disappears, keep the egg reachable.
  display = { ...display, workArea: { x: 0, y: 24, width: 1000, height: 700 }, scaleFactor: 2 };
  position = { x: -790, y: -495 };
  await request(win, 'window.petWindow.beginDrag()');
  screen.emit('display-removed', {}, display);
  assert.deepEqual(position, { x: 0, y: 24 });
  assert.equal(await win.webContents.executeJavaScript('window.petWindow.endDrag()'), true);
  position = { x: 800, y: 500 };
  display = { ...display, workArea: { x: 0, y: 24, width: 700, height: 500 } };
  screen.emit('display-metrics-changed', {}, display, ['workArea', 'scaleFactor']);
  assert.deepEqual(position, { x: 520, y: 324 });
  await request(win, 'window.petWindow.hover(true)');
  ignores.length = 0;
  screen.emit('display-metrics-changed', {}, display, ['scaleFactor']);
  assert.deepEqual(ignores, [], 'display metrics must not desynchronize an idle renderer hover');
  const originalPrimary = screen.getPrimaryDisplay.bind(screen);
  screen.getPrimaryDisplay = () => ({ ...display, workArea: { x: -1200, y: 30, width: 200, height: 210 } });
  assert.deepEqual(initialPosition(), { x: -1200, y: 30 }, 'initial/reset margins cannot push the egg off a small work area');
  screen.getPrimaryDisplay = originalPrimary;
  console.log('PASS: simulated display removal/work-area shrink recovers window and cancels drag');

  screen.getCursorScreenPoint = originalCursor;
  screen.getDisplayNearestPoint = originalNearest;
  screen.getDisplayMatching = originalMatching;
  win.getPosition = originalPosition;
  win.setPosition = originalSetPosition;
  win.getBounds = originalBounds;
  assert.equal(win.isFocused(), false);
  assert.deepEqual(errors, []);
  win.destroy();
  assert.deepEqual(['display-removed', 'display-metrics-changed'].map(name => screen.listenerCount(name)), baseListeners);
  console.log('PASS: display listener cleanup; no renderer errors. Other-app focus/click-through remain manual checks.');
  clearTimeout(deadline);
  app.quit();
}).catch(error => {
  console.error(error);
  clearTimeout(deadline);
  app.exit(1);
});
