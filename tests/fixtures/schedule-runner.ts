import { app, BrowserWindow } from 'electron';
const [directory, mode] = process.argv.slice(2);
if (!directory || !['register','inspect','cancel','ack'].includes(mode)) throw new Error('Invalid arguments');
app.setPath('userData',directory);
const timeout = setTimeout(() => app.exit(2),15000);
const lifecycle = require('../../src/main/app') as typeof import('../../src/main/app');
const start = lifecycle.startJarvis;
lifecycle.startJarvis = () => start({ show:false, onReady: async eggWindow => {
  const panel = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/prompt.html'));
  if (!panel) throw new Error('Missing input panel');
  const run = (code: string) => panel.webContents.executeJavaScript(code);
  let reply;
  if (mode === 'register') {
    for (const [id,input] of [['alarm','내일 오전 7시 알람'],['reminder','내일 15:00 리마인더 서류 확인']]) {
      const draft = await run(`window.schedulePanel.preview(${JSON.stringify(id)},${JSON.stringify(input)})`);
      if (!draft.ok) throw new Error('Preview failed');
      reply = await run(`window.schedulePanel.confirm(${JSON.stringify(id)})`);
    }
  }
  if (mode === 'cancel') for (const id of ['alarm','reminder']) reply = await run(`window.schedulePanel.cancel('${id}')`);
  if (mode === 'ack') for (const id of ['alarm','reminder']) await run(`window.schedulePanel.acknowledge('${id}')`);
  const after = await run('window.schedulePanel.read()');
  const rendered = await run('new Promise(resolve => setTimeout(() => resolve(document.querySelector("#schedules").textContent),50))');
  const petId = (await eggWindow.webContents.executeJavaScript('window.petWindow.snapshot()')).petId;
  console.log('SCHEDULE_READY:'+JSON.stringify({after,reply,rendered,petId}));
  clearTimeout(timeout); app.quit();
}});
require('../../src/main/index');
