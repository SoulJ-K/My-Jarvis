import { app, BrowserWindow } from 'electron';
const lifecycle = require('../../src/main/app') as typeof import('../../src/main/app');
const startJarvis = lifecycle.startJarvis;

// Only this test entry point accepts an alternate store. Production has no such switch.
const [directory, mode] = process.argv.slice(2);
if (!directory || !['once', 'hold', 'exercise', 'react-hold'].includes(mode)) throw new Error('Invalid test arguments');
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

// Exercise the production entry; override only test presentation/callbacks.
lifecycle.startJarvis = () => startJarvis({
  show: false,
  onReady: async win => {
    const initial = await inspect(win);
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
    console.log(`TEST_READY:${JSON.stringify({ ...initial, exercise })}`);
    if (mode === 'once' || mode === 'exercise') {
      clearTimeout(timeout);
      app.quit();
    }
  },
  onFailure: code => console.log(`TEST_FAILURE:${JSON.stringify({ code, windows: BrowserWindow.getAllWindows().length })}`),
});
require('../../src/main/index');
process.on('SIGTERM', () => { clearTimeout(timeout); app.quit(); });
