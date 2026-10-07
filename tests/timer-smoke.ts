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
import { createAssistantFixture } from './assistant-fixture';
import { timerNotifications } from '../src/main/notifications';
const directory = mkdtempSync(path.join(tmpdir(),'jarvis-timer-smoke-'));
app.setPath('userData',directory);
app.on('window-all-closed', () => {});
app.on('quit', () => {
  // Chromium can still write cache files while Electron quits.
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  catch { console.warn('WARN: temporary test directory cleanup incomplete; retained for later cleanup.'); }
});
const timeout = setTimeout(() => app.exit(2),25000);
app.whenReady().then(async () => {
  app.dock?.hide();
  let now = Date.now();
  let panels: Awaited<ReturnType<typeof createPromptWindows>>;
  const service = new TimerService(new TimerRepository(directory), {wall: () => now,monotonic: () => now}, report => report('failed'), () => panels?.refresh());
  const register = ipcMain.handle.bind(ipcMain);
  let submitHandler!: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
  let submitEvent!: IpcMainInvokeEvent;
  let assistantSubmitHandler!: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
  let assistantSubmitEvent!: IpcMainInvokeEvent;
  let assistantSubmissions = 0;
  let closeRequests = 0;
  ipcMain.handle = (channel, listener) => {
    if (channel === 'timer:submit') { submitHandler = listener; register(channel,(event,...args) => { submitEvent = event; return listener(event,...args); }); }
    else if (channel === 'assistant:submit-timer') {
      assistantSubmitHandler = listener;
      register(channel, (event, ...args) => { assistantSubmitEvent = event; assistantSubmissions++; return listener(event, ...args); });
    }
    else if (channel === 'prompt:close') register(channel, (event, ...args) => {
      closeRequests++;
      return listener(event, ...args);
    });
    else register(channel,listener);
  };
  const schedules = new ReminderService(new ScheduleRepository(directory), () => now, undefined, () => panels?.refresh());
  const fixture = createAssistantFixture(directory, service, schedules, () => now, () => panels?.refresh());
  panels = await createPromptWindows(service, true, schedules, undefined, fixture.assistant);
  await fixture.loadCard();
  ipcMain.handle = register;
  // Keep the automated background window clock active; deadline drift is tested separately.
  panels.prompt.webContents.setBackgroundThrottling(false);
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
  // Enter during composition must submit exactly once after compositionend,
  // without requiring a second Enter or an explicit click.
  await run(`document.querySelector('#request').dispatchEvent(new CompositionEvent('compositionend'));`);
  await run(`new Promise(resolve => setTimeout(resolve,150))`);
  assert.equal(service.views().length,1);
  assert.equal(assistantSubmissions,1,'composition Enter must reach the service exactly once after commit');
  assert.match(await run('document.querySelector("#result").textContent'),/저장했습니다/);
  assert.throws(() => assistantSubmitHandler(assistantSubmitEvent,'extra','5분 타이머','default',false,'bad'), /PANEL_REQUEST_DENIED/);
  assert.equal((await run("window.timerPanel.submit('legacy-invalid','지원하지 않는 요청')")).ok,false);
  assert.throws(() => submitHandler(submitEvent,'extra','5분 타이머','bad'), /PROMPT_REQUEST_DENIED/);
  assert.equal(await run('typeof require'),'undefined');
  const foreign = new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../src/preload/prompt.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await foreign.loadFile(path.join(__dirname,'../src/renderer/prompt.html'));
  assert.equal(await foreign.webContents.executeJavaScript(`window.timerPanel.submit('foreign','5분 타이머').then(()=>false,()=>true)`),true);
  assert.equal(await panels.notice.webContents.executeJavaScript(`window.timerPanel.cancel('bad').then(()=>false,()=>true)`),true);
  assert.equal(await foreign.webContents.executeJavaScript(`window.assistantPanel.submitTimer('foreign','5분 타이머','default').then(()=>false,()=>true)`),true);
  assert.equal(await foreign.webContents.executeJavaScript(`window.assistantPanel.read().then(()=>false,()=>true)`),true);
  assert.equal(await panels.notice.webContents.executeJavaScript(`window.assistantPanel.action({type:'cancel',kind:'timer',id:'bad'}).then(()=>false,()=>true)`),true);
  assert.equal(await fixture.card.webContents.executeJavaScript(`window.assistantPanel.submitTimer('card-forbidden','5분 타이머','default').then(()=>false,()=>true)`),true);
  foreign.destroy();
  assert.equal(panels.prompt.isVisible(), true, 'Escape starts with an open input window');
  const closesBeforeEscape = closeRequests;
  const escapeStarted = performance.now();
  // Observe the actual close path, not completion of an unrelated timer read.
  // Keep this below the 8-second automatic close; never close the window for it.
  const escapeState = await run(`(() => {
    const before = {
      busy: document.querySelector('#timer-form').getAttribute('aria-busy'),
      inputDisabled: document.querySelector('#request').disabled
    };
    const event = new KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true});
    document.dispatchEvent(event);
    return {...before, handled: event.defaultPrevented};
  })()`);
  while (panels.prompt.isVisible() && performance.now() - escapeStarted < 1000) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const escapeResult = {
    ...escapeState, closeRequests: closeRequests - closesBeforeEscape,
    visible: panels.prompt.isVisible(), elapsedMs: performance.now() - escapeStarted,
  };
  assert.ok(escapeResult.handled && escapeResult.closeRequests === 1 && !escapeResult.visible && escapeResult.elapsedMs <= 1000,
    `Escape must request and complete input hiding within 1000ms: ${JSON.stringify(escapeResult)}`);
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
  assert.equal(panels.notice.isVisible(),false,'first alarm must not open a duplicate app notice');
  assert.equal(BrowserWindow.getFocusedWindow(),before);
  assert.equal(service.views()[0].systemDelivery,'failed');
  assert.equal(service.views()[0].appDisplayed,false,'hidden notice cannot claim app display');
  const screenshot = path.join(tmpdir(),'jarvis-timer-prompt.png');
  panels.open(); await run('new Promise(resolve => setTimeout(resolve,100))');
  await panels.prompt.webContents.capturePage().then(image => require('node:fs').writeFileSync(screenshot,image.toPNG()));
  assert.match(await run('document.querySelector("#schedules").textContent'),/시스템 알림 실패/);
  await run(`Array.from(document.querySelectorAll('#schedules button')).find(button => button.textContent === '알림 확인').click()`);
  await run('new Promise(resolve => setTimeout(resolve,100))');
  assert.equal(service.views().length,0);
  console.log('PASS: Electron input/open/Escape, composition guards, durable submit, sender validation, failed OS delivery + explicit inbox access without automatic notice, no timer focus takeover');
  console.log('SCREENSHOT:'+screenshot);
  // A second successful form registration closes automatically if no new interaction occurs.
  panels.open();
  const submissionsBeforeDoubleSubmit = assistantSubmissions;
  await run(`document.querySelector('#request').value='5분 타이머'; document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit()`);
  await run('new Promise(resolve => setTimeout(resolve,100))');
  assert.equal(service.views().length,1);
  assert.equal(assistantSubmissions,submissionsBeforeDoubleSubmit+1,'repeated form submissions must not duplicate a saved timer');
  assert.match(await run('document.querySelector("#result").textContent'), /8초 뒤/);
  await new Promise(resolve => setTimeout(resolve,1100));
  assert.match(await run('document.querySelector("#result").textContent'), /7초 뒤/);
  panels.prompt.blur(); panels.open();
  assert.match(await run('document.querySelector("#result").textContent'), /7초 뒤/, 'refocusing keeps the same deadline');
  await new Promise(resolve => setTimeout(resolve,7100));
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
  typing.destroy(); panels.dispose(); fixture.dispose(); service.dispose(); schedules.dispose();
  clearTimeout(timeout); app.quit();
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
