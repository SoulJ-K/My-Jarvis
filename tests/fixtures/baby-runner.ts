import assert from 'node:assert/strict';
import { app, BrowserWindow, powerMonitor, screen } from 'electron';
const [directory, clock] = process.argv.slice(2);
if (!directory || !Number.isSafeInteger(Number(clock))) throw new Error('TEST_ARGUMENT_INVALID');
app.setPath('userData', directory);
Date.now = () => Number(clock);
powerMonitor.getSystemIdleTime = () => 0;
const timeout = setTimeout(() => app.exit(2), 12000);
const startup = require('../../src/main/app') as typeof import('../../src/main/app');
const start = startup.startJarvis;
startup.startJarvis = () => start({ show: false, onReady: async win => {
  const run = (script: string) => win.webContents.executeJavaScript(script);
  assert.equal((await run('window.petWindow.snapshot()')).stage, 'baby');
  assert.equal((await run('window.petWindow.snapshot()')).name, '별');
  win.isVisible = () => true; // Test presence without displaying or focusing the window.
  const state = await run('window.babyLife.read()');
  const prompt = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/prompt.html'))!;
  let opened = 0;
  prompt.show = () => { opened++; }; prompt.focus = () => {};
  const cursor = screen.getCursorScreenPoint;
  screen.getCursorScreenPoint = () => ({ x: 100, y: 100 });
  await run('(async()=>{ window.petWindow.beginDrag(); await window.petWindow.endDrag(); })()');
  screen.getCursorScreenPoint = cursor;
  assert.equal(opened, 1);
  await new Promise(resolve => setTimeout(resolve, 30));

  console.log(`BABY_RESULT:${JSON.stringify(state)}`);
  clearTimeout(timeout); app.quit();
}, onFailure: () => app.exit(1) });
require('../../src/main/index');
