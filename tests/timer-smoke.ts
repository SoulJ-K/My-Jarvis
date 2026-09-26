import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TimerRepository } from '../src/storage/timer-repository';
import { TimerService } from '../src/assistant/timer';
import { ReminderService } from '../src/assistant/reminders';
import { ScheduleRepository } from '../src/storage/schedule-repository';
import { createPromptWindows } from '../src/main/prompt-window';
import { timerNotifications } from '../src/main/notifications';
const directory = mkdtempSync(path.join(tmpdir(),'jarvis-timer-smoke-'));
app.setPath('userData',directory);
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => app.exit(2),25000);
app.whenReady().then(async () => {
  app.dock?.hide();
  let now = Date.now();
  let panels: Awaited<ReturnType<typeof createPromptWindows>>;
  const service = new TimerService(new TimerRepository(directory), {wall: () => now,monotonic: () => now}, report => report('failed'), () => panels?.refresh());
  const register = ipcMain.handle.bind(ipcMain);
  let submitHandler!: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
  let submitEvent!: IpcMainInvokeEvent;
  ipcMain.handle = (channel, listener) => {
    if (channel === 'timer:submit') { submitHandler = listener; register(channel,(event,...args) => { submitEvent = event; return listener(event,...args); }); }
    else register(channel,listener);
  };
  const schedules = new ReminderService(new ScheduleRepository(directory), () => now, undefined, () => panels?.refresh());
  panels = await createPromptWindows(service, true, schedules);
  ipcMain.handle = register;
  const run = (code: string) => panels.prompt.webContents.executeJavaScript(code);
  assert.equal(panels.prompt.isVisible(),false);
  assert.equal(panels.notice.isFocusable(),false);
  panels.open();
  await run(`new Promise(resolve => setTimeout(resolve, 100))`);
  assert.equal(await run('document.activeElement.id'),'request');
  await run(`(() => { const i=document.querySelector('#request'); i.value='5분 타이머';
    i.dispatchEvent(new CompositionEvent('compositionstart'));
    i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
    document.querySelector('form').requestSubmit(); })()`);
  assert.equal(service.views().length,0);
  await run(`document.querySelector('#request').dispatchEvent(new CompositionEvent('compositionend')); document.querySelector('form').requestSubmit();`);
  assert.equal(service.views().length,0);
  await run(`new Promise(resolve => setTimeout(resolve,120))`);
  await run(`document.querySelector('form').requestSubmit()`);
  await run(`new Promise(resolve => setTimeout(resolve,150))`);
  assert.equal(service.views().length,1);
  assert.match(await run('document.querySelector("#result").textContent'),/저장했습니다/);
  assert.throws(() => submitHandler(submitEvent,'extra','5분 타이머','bad'), /PROMPT_REQUEST_DENIED/);
  assert.equal(await run('typeof require'),'undefined');
  const foreign = new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../src/preload/prompt.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await foreign.loadFile(path.join(__dirname,'../src/renderer/prompt.html'));
  assert.equal(await foreign.webContents.executeJavaScript(`window.timerPanel.submit('foreign','5분 타이머').then(()=>false,()=>true)`),true);
  assert.equal(await panels.notice.webContents.executeJavaScript(`window.timerPanel.cancel('bad').then(()=>false,()=>true)`),true);
  foreign.destroy();
  await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
  await run('window.timerPanel.read()');
  assert.equal(panels.prompt.isVisible(),false);
  assert.equal(service.views()[0].status,'pending');
  // A separate ordinary window represents keyboard work. Timer output must not focus a panel.
  const typing = new BrowserWindow({width:300,height:150,show:true});
  await typing.loadURL('data:text/html,<input autofocus aria-label="Focus test">');
  typing.focus();
  await new Promise(resolve => setTimeout(resolve,100));
  const before = BrowserWindow.getFocusedWindow();
  now += 300000; service.tick();
  await new Promise(resolve => setTimeout(resolve,150));
  assert.equal(panels.prompt.isVisible(),false);
  assert.equal(panels.notice.isVisible(),true);
  assert.equal(BrowserWindow.getFocusedWindow(),before);
  assert.equal(service.views()[0].systemDelivery,'failed');
  assert.equal(service.views()[0].appDisplayed,true);
  const screenshot = path.join(tmpdir(),'jarvis-timer-prompt.png');
  panels.open(); await run('new Promise(resolve => setTimeout(resolve,100))');
  await panels.prompt.webContents.capturePage().then(image => require('node:fs').writeFileSync(screenshot,image.toPNG()));
  assert.match(await run('document.querySelector("#timers").textContent'),/시스템 알림 실패/);
  await run(`document.querySelector('#timers button').click()`); await run('window.timerPanel.read()');
  assert.equal(service.views().length,0);
  console.log('PASS: Electron input/open/Escape, composition guards, durable submit, sender validation, failed OS delivery + visible app inbox, no timer focus takeover');
  console.log('SCREENSHOT:'+screenshot);
  // A second successful form registration closes automatically if no new interaction occurs.
  panels.open();
  await run(`document.querySelector('#request').value='5분 타이머'; document.querySelector('form').requestSubmit()`);
  await run('new Promise(resolve => setTimeout(resolve,100))');
  assert.equal(service.views().length,1);
  await new Promise(resolve => setTimeout(resolve,8200));
  assert.equal(panels.prompt.isVisible(),false);
  panels.open();
  await run('new Promise(resolve => setTimeout(resolve,100))');
  await run(`document.querySelector('#request').value='취소할 초안'`);
  panels.prompt.close();
  await run('new Promise(resolve => setTimeout(resolve,50))');
  panels.open(); await run('new Promise(resolve => setTimeout(resolve,50))');
  assert.equal(await run('document.querySelector("#request").value'),'');
  assert.equal(service.views().length,1); // Closing the draft is not cancellation of a saved timer.
  console.log('PASS: successful result auto-closes; native window close discards draft, preserves saved timer');
  // Native notification checks are opt-in; ordinary regression runs must not
  // request permissions or send an actual notification to the user's desktop.
  if (process.env.JARVIS_NATIVE_NOTIFICATION_TEST === '1') {
    const notifications = timerNotifications(message => {
      // Platform diagnostic only; no timer text, private data or error object serialization.
      console.log('SYSTEM_NOTIFICATION_FAILURE_REASON:'+message);
    });
    const outcome = await new Promise<string>(resolve => notifications.notify(resolve));
    console.log('SYSTEM_NOTIFICATION_OBSERVED:'+outcome);
    notifications.dispose();
  }
  typing.destroy(); panels.dispose(); service.dispose(); schedules.dispose();
  clearTimeout(timeout); rmSync(directory,{recursive:true,force:true}); app.quit();
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
