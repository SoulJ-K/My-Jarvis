import { app, BrowserWindow } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { petDatabasePath } from '../../src/storage/pet-repository';
const [directory, mode] = process.argv.slice(2);
if (!directory || !['register','inspect','cancel','ack','care-and-timer'].includes(mode)) throw new Error('Invalid arguments');
app.setPath('userData',directory);
const timeout = setTimeout(() => app.exit(2),15000);
const lifecycle = require('../../src/main/app') as typeof import('../../src/main/app');
const start = lifecycle.startJarvis;
lifecycle.startJarvis = () => start({ show:false, onReady: async eggWindow => {
  if (mode === 'care-and-timer') {
    // Real Chromium pointer handlers write a care event while the timer panel exists.
    await eggWindow.webContents.executeJavaScript(`window.testReaction = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('missing care reaction')), 3000);
      const off = window.petBrain.subscribe(state => {
        if (state.behavior !== 'reacting') return;
        clearTimeout(timeout); off(); resolve(state);
      });
    }); void 0;`);
    eggWindow.webContents.sendInputEvent({ type: 'mouseDown', x: 90, y: 95, button: 'left', clickCount: 1 });
    eggWindow.webContents.sendInputEvent({ type: 'mouseUp', x: 90, y: 95, button: 'left', clickCount: 1 });
    await eggWindow.webContents.executeJavaScript('window.testReaction');
  }
  const panel = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/prompt.html'));
  if (!panel) throw new Error('Missing input panel');
  const before = await panel.webContents.executeJavaScript('window.timerPanel.read()');
  let reply;
  if (mode === 'register' || mode === 'care-and-timer') reply = await panel.webContents.executeJavaScript("window.timerPanel.submit('restart-request','5분 타이머')");
  if (mode === 'cancel') reply = await panel.webContents.executeJavaScript("window.timerPanel.cancel('restart-request')");
  if (mode === 'ack') await panel.webContents.executeJavaScript("window.timerPanel.acknowledge('restart-request')");
  const after = await panel.webContents.executeJavaScript('window.timerPanel.read()');
  const rendered = await panel.webContents.executeJavaScript('new Promise(resolve => setTimeout(() => resolve(document.querySelector("#timers").textContent), 50))');
  const db = new DatabaseSync(petDatabasePath(directory), { readOnly: true });
  const careCount = Number(db.prepare('SELECT count(*) AS count FROM egg_care').get()?.count);
  db.close();
  const petId = (await eggWindow.webContents.executeJavaScript('window.petWindow.snapshot()')).petId;
  console.log('TIMER_READY:'+JSON.stringify({ before,after,reply,rendered,careCount,petId }));
  clearTimeout(timeout); app.quit();
}});
require('../../src/main/index');
