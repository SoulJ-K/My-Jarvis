import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createPetWindow } from '../src/main/windows';

// App-owned integration checks. These do not simulate clicks in other macOS apps.
app.setName('Jarvis Pet Smoke Test');
const timeout = setTimeout(() => {
  console.error('FAIL: 알 창 검사 시간 초과');
  app.exit(1);
}, 15_000);

app.whenReady().then(async () => {
  app.dock?.hide();
  const win = await createPetWindow(false);
  const errors: string[] = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level === 3) errors.push(message);
  });
  assert.equal(win.isFocusable(), false);
  assert.equal(win.isAlwaysOnTop(), true);
  assert.equal(win.isResizable(), false);
  assert.equal(await win.webContents.executeJavaScript('typeof require'), 'undefined');
  assert.equal(await win.webContents.executeJavaScript('typeof process'), 'undefined');
  assert.equal(await win.webContents.executeJavaScript('typeof window.ipcRenderer'), 'undefined');
  assert.equal(await win.webContents.executeJavaScript('typeof window.petWindow.endDrag'), 'function');
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("#egg").length'), 1);
  console.log('PASS: 실제 페이지·제한된 preload 연결·창과 보안 설정');

  const hoverCalls: boolean[] = [];
  const originalIgnore = win.setIgnoreMouseEvents.bind(win);
  win.setIgnoreMouseEvents = (ignore, options) => {
    hoverCalls.push(ignore);
    originalIgnore(ignore, options);
  };
  // invoke is used as an ordering barrier after send, so assertions are not timer-dependent.
  await win.webContents.executeJavaScript(`(async () => {
    window.petWindow.hover('bad-value');
    await window.petWindow.endDrag();
  })()`);
  assert.deepEqual(hoverCalls, []);
  await win.webContents.executeJavaScript(`(async () => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 90, clientY: 95 }));
    await window.petWindow.endDrag();
  })()`);
  assert.deepEqual(hoverCalls, [false, true]);
  hoverCalls.length = 0;
  await win.webContents.executeJavaScript(`(async () => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 30 }));
    await window.petWindow.endDrag();
  })()`);
  assert.deepEqual(hoverCalls, []);
  console.log('PASS: 알 중심과 투명 모서리 구분·잘못된 요청 거절');

  const foreign = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, '../src/preload/index.js'),
    nodeIntegration: false, contextIsolation: true, sandbox: true,
  } });
  await foreign.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await foreign.webContents.executeJavaScript(`(async () => {
    window.petWindow.hover(true);
    window.petWindow.beginDrag();
    await window.petWindow.endDrag();
  })()`);
  assert.deepEqual(hoverCalls, []);
  foreign.destroy();
  console.log('PASS: 다른 창에서 보낸 조작 요청 거절');

  const capture = await win.webContents.capturePage();
  assert.equal(capture.isEmpty(), false);
  const bitmap = capture.toBitmap();
  const size = capture.getSize();
  const alphaAt = (x: number, y: number) => bitmap[(y * size.width + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(Math.floor(size.width / 2), Math.floor(size.height / 2)), 255);
  mkdirSync('.local', { recursive: true });
  writeFileSync('.local/egg-preview.png', capture.toPNG());
  assert.deepEqual(errors, []);
  console.log('PASS: 투명 배경·불투명 알 렌더링, .local/egg-preview.png 저장');
  win.destroy();
  clearTimeout(timeout);
  app.quit();
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});
