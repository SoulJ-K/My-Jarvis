// Only run by the synthetic manual-backup suite, with explicitly-owned paths.
const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, Notification } = require('electron');
const payload = __dirname, expectedData = process.env.MANUAL_BACKUP_EXPECTED_DATA, at = process.env.MANUAL_BACKUP_TIME;
assert.ok(process.env.MANUAL_BACKUP_TEST_ROOT && expectedData.startsWith(process.env.MANUAL_BACKUP_TEST_ROOT + path.sep));
Date.now = () => Number(at);
Object.defineProperty(performance, 'now', { value: () => 0 });
let requests = 0;
const deny = () => { requests++; throw new Error('SYNTHETIC_NETWORK_DENIED'); };
globalThis.fetch = async () => deny();
for (const name of ['node:http','node:https']) { const m = require(name); m.get = deny; m.request = deny; }
require('node:net').Socket.prototype.connect = deny; require('node:tls').connect = deny;
Notification.isSupported = () => false;
app.on('session-created', s => { s.enableNetworkEmulation({ offline: true }); s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,cb)=>{requests++;cb({cancel:true});}); });
const mod = require(path.join(payload,'dist/src/main/app.js')), start = mod.startJarvis;
let ready = false;
mod.startJarvis = () => start({ show:false, onReady: async win => {
  assert.equal(app.getPath('userData'),expectedData);assert.equal(app.getPath('sessionData'),expectedData);
  assert.ok(BrowserWindow.getAllWindows().every(w=>!w.isVisible()));
  const pet=await win.webContents.executeJavaScript('window.petWindow.snapshot()');
  assert.equal(pet.stage,'baby');assert.equal(pet.name,'복구시험별');
  const image=await win.webContents.executeJavaScript('(async()=>{const img=document.querySelector("#backup-art");await img.decode();return {width:img.naturalWidth,url:img.src};})()');
  assert.ok(image.width>1);assert.ok(image.url.startsWith(require('node:url').pathToFileURL(payload).href));
  const panels=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/prompt.html'));assert.ok(panels);
  await panels.webContents.executeJavaScript('window.assistantPanel.read()');
  assert.equal(requests,0);ready=true;console.log('MANUAL_APP_READY');app.quit();
}, onFailure: () => app.exit(1) });
app.on('quit',()=>{assert.ok(ready);console.log('MANUAL_APP_CLEAN_EXIT');});
setTimeout(()=>app.exit(2),20000).unref();
// The enclosing production index calls the wrapped startJarvis after this hook.
