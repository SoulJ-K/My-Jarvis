import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createPetWindow } from '../src/main/windows';

// App-owned integration checks. These do not simulate clicks in other macOS apps.
app.setName('Jarvis Pet Smoke Test');
// Keep the harness alive between windows; otherwise Electron's default exit can hide a failure.
app.on('window-all-closed', () => {});
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
  assert.equal(await win.webContents.executeJavaScript('typeof window.petBrain.subscribe'), 'function');
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
  assert.equal(await foreign.webContents.executeJavaScript(`window.petBrain.read().then(() => false, () => true)`), true);
  foreign.destroy();
  console.log('PASS: 다른 창에서 보낸 조작 요청 거절');

  assert.deepEqual(await win.webContents.executeJavaScript('window.petBrain.read()'), { behavior: 'idle', revision: 0 });
  // Simulate the approved gesture messages, not OS mouse input in another app.
  const afterClick = await win.webContents.executeJavaScript(`(async () => {
    const changed = new Promise(resolve => {
      const unsubscribe = window.petBrain.subscribe(state => {
        if (state.behavior !== 'reacting') return;
        unsubscribe();
        resolve(state);
      });
    });
    window.petWindow.beginDrag();
    const moved = await window.petWindow.endDrag();
    const state = await changed;
    return { moved, state, rendered: document.querySelector('#egg').classList.contains('reacting') };
  })()`);
  assert.equal(afterClick.moved, false);
  assert.equal(afterClick.state.behavior, 'reacting');
  assert.equal(afterClick.rendered, true);
  win.webContents.send('pet:state', { behavior: 'idle', revision: 0 });
  assert.equal(await win.webContents.executeJavaScript("document.querySelector('#egg').classList.contains('reacting')"), true);

  // Reloading the page must read the existing main-process brain, not create revision 0.
  const loaded = new Promise<void>(resolve => win.webContents.once('did-finish-load', () => resolve()));
  win.webContents.reload();
  await loaded;
  assert.ok((await win.webContents.executeJavaScript('window.petBrain.read()')).revision >= 1);
  const rested = await win.webContents.executeJavaScript(`(async () => {
    let unsubscribe;
    const idle = new Promise(resolve => {
      unsubscribe = window.petBrain.subscribe(next => {
        if (next.behavior === 'idle') resolve();
      });
    });
    const state = await window.petBrain.read();
    if (state.behavior === 'reacting') await idle;
    unsubscribe();
    return { state: await window.petBrain.read(), rendered: document.querySelector('#egg').classList.contains('reacting') };
  })()`);
  assert.deepEqual(rested.state, { behavior: 'idle', revision: 2 });
  assert.equal(rested.rendered, false);
  console.log('PASS: 승인된 클릭 → Brain 반응 → 화면 갱신 → 휴식, 화면 재로딩 중 상태 유지');

  await win.webContents.executeJavaScript(`(async () => {
    window.petWindow.beginDrag();
    window.petWindow.cancelDrag();
    await window.petWindow.endDrag();
    await window.petWindow.endDrag();
  })()`);
  assert.deepEqual(await win.webContents.executeJavaScript('window.petBrain.read()'), { behavior: 'idle', revision: 2 });
  console.log('PASS: 취소된 드래그·중복 종료 메시지는 클릭 반응을 만들지 않음');

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
  const reopened = await createPetWindow(false);
  assert.deepEqual(await reopened.webContents.executeJavaScript('window.petBrain.read()'), { behavior: 'idle', revision: 0 });
  reopened.destroy();
  console.log('PASS: 창 종료 후 IPC 정리 및 재생성');
  clearTimeout(timeout);
  app.quit();
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  app.exit(1);
});
