import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { mock } from 'node:test';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { checkProfile } from './backup-profile';
import type { HatchView } from '../../src/shared/hatch';

const [directory, at, stage, mode = 'normal'] = process.argv.slice(2);
assert.ok(path.isAbsolute(directory));
assert.ok(['egg', 'baby'].includes(stage));
assert.ok(['normal', 'hatch'].includes(mode));
assert.equal(realpathSync(directory), directory);
assert.ok(!existsSync(path.join(directory, 'INCOMPLETE')));
checkProfile(directory); // Missing stores must fail before production can create new ones.
const now = Number(at); assert.ok(Number.isSafeInteger(now) && now > 0);
Date.now = () => now;
Object.defineProperty(performance, 'now', { value: () => 0 });
app.setPath('userData', directory);
const session = path.join(directory, 'browser-session');
mkdirSync(session, { recursive: true, mode: 0o700 });
app.setPath('sessionData', session);
let requests = 0;
const deny = () => { requests++; throw new Error('BACKUP_TEST_OFFLINE'); };
mock.method(globalThis, 'fetch', async () => deny());
for (const module of [http, https]) for (const method of ['request', 'get'] as const) mock.method(module, method, deny);
mock.method(net.Socket.prototype, 'connect', deny);
mock.method(tls, 'connect', deny);
app.on('session-created', s => {
  s.enableNetworkEmulation({ offline: true });
  s.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => {
    requests++; callback({ cancel: true });
  });
});
const timeout = setTimeout(() => app.exit(2), 15000);
const lifecycle = require('../../src/main/app') as typeof import('../../src/main/app');
const start = lifecycle.startJarvis;
let ready = false;
lifecycle.startJarvis = () => start({ show: false,
  notifySchedule: () => { throw new Error('RECOVERED_INITIAL_NOTICE_MUST_NOT_SEND'); },
  onReady: async win => {
    const panel = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/prompt.html'));
    assert.ok(panel, 'assistant repositories must all open');
    const pet = await win.webContents.executeJavaScript('window.petWindow.snapshot()');
    assert.equal(pet.stage, stage);
    let hatch: HatchView | undefined;
    if (mode === 'hatch') {
      hatch = await win.webContents.executeJavaScript('window.hatch.read()') as HatchView;
      assert.equal(hatch.available, false); assert.equal(hatch.state.ready, true);
      assert.equal(hatch.state.name, null); assert.equal(hatch.state.petId, pet.petId);
    } else if (stage === 'baby') {
      assert.equal(pet.name, '복구시험별');
      assert.ok(await win.webContents.executeJavaScript('window.babyLife.read()'));
    }
    const state = await panel.webContents.executeJavaScript('window.assistantPanel.read()');
    assert.equal(state.warning, undefined);
    assert.ok(BrowserWindow.getAllWindows().every(w => !w.isVisible()));
    assert.equal(requests, 0);
    assert.equal(app.getPath('userData'), directory);
    assert.equal(app.getPath('sessionData'), session);
    ready = true;
    console.log('BACKUP_APP_READY:' + JSON.stringify({ pet, state, hidden: true, requests, ...(hatch ? { hatch: hatch.state } : {}) }));
    clearTimeout(timeout);
    app.quit();
  }, onFailure: code => console.log('BACKUP_APP_FAILURE:' + code),
});
// app.quit() runs before-quit cleanup and will-quit closes the pet repositories.
// The parent also waits for process exit; this line alone is not a backup barrier.
app.on('quit', (_event, code) => { if (ready && code === 0) console.log('BACKUP_APP_CLEAN_EXIT'); });
require('../../src/main/index');
