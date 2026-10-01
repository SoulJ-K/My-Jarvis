import assert from 'node:assert/strict';
import { app, BrowserWindow, dialog, ipcMain, powerMonitor, screen, type IpcMainInvokeEvent, type Menu } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadOrCreateEgg, petDatabasePath } from '../../src/storage/pet-repository';
import { openEggLife } from '../../src/storage/egg-life-repository';
import { hatchScenes, nextHatchStep, type Lifecycle } from '../../src/pet/lifecycle';
import type { HatchView } from '../../src/shared/hatch';

const [directory, mode, clockValue] = process.argv.slice(2);
if (!directory || !['inspect', 'step', 'exercise', 'exercise-edge', 'ready-live', 'ready-care', 'ready-startup',
  'activation', 'policy-inspect', 'policy-activation', 'policy-live', 'policy-care'].includes(mode)) {
  throw new Error('INVALID_TEST_ARGUMENTS');
}
app.setPath('userData', directory);
const interactive = ['step', 'exercise', 'exercise-edge', 'activation', 'policy-activation'].includes(mode);
let trayMenu: Menu | undefined;
let electronForApp: typeof import('electron') | undefined;
if (interactive) {
  // Use the real app routing and renderer while keeping native windows hidden.
  dialog.showErrorBox = (title, message) => { console.error(`HIDDEN_DIALOG:${title}: ${message}`); };
  electronForApp = { ...require('electron'), Tray: class {
    setTitle() {} setToolTip() {} destroy() {}
    setContextMenu(menu: Menu) { trayMenu = menu; }
  } };
  const visible = new Set<number>();
  BrowserWindow.prototype.show = function () { visible.add(this.id); this.emit('show'); };
  BrowserWindow.prototype.showInactive = function () { visible.add(this.id); this.emit('show'); };
  BrowserWindow.prototype.hide = function () { visible.delete(this.id); this.emit('hide'); };
  BrowserWindow.prototype.isVisible = function () { return visible.has(this.id); };
  BrowserWindow.prototype.focus = function () {};
}
const modules = require('node:module');
const originalLoad = modules._load;
const appModule = require.resolve('../../src/main/app');
modules._load = function (request: string, parent: { filename: string }, ...args: unknown[]) {
  if (electronForApp && request === 'electron' && parent.filename === appModule) return electronForApp;
  return originalLoad.call(this, request, parent, ...args);
};
let lifecycle: typeof import('../../src/main/app');
try { lifecycle = require('../../src/main/app'); } finally { modules._load = originalLoad; }
const startJarvis = lifecycle.startJarvis;
const injectedPolicy = mode.startsWith('ready-');
const productPolicyMode = mode.startsWith('policy-');
const readinessMode = injectedPolicy || mode === 'policy-live' || mode === 'policy-care';
let eggNow = 0;
if (readinessMode || productPolicyMode) {
  eggNow = clockValue === undefined ? Date.parse(loadOrCreateEgg(directory).createdAt) : Number(clockValue);
  if (!Number.isSafeInteger(eggNow) || eggNow < 0) throw new Error('INVALID_TEST_CLOCK');
  openEggLife(directory, () => eggNow).close();
  if (mode === 'ready-startup') eggNow += 1000;
}
const timeout = setTimeout(() => app.exit(2), 30000);
const register = ipcMain.handle.bind(ipcMain);
const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
let trustedEvent: IpcMainInvokeEvent;
ipcMain.handle = (channel, listener) => {
  if (channel.startsWith('hatch:')) {
    handlers.set(channel, listener);
    register(channel, (event, ...args) => { trustedEvent = event; return listener(event, ...args); });
  } else register(channel, listener);
};
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean> | boolean) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await pause(); }
  throw new Error('UI_DID_NOT_SETTLE');
}
lifecycle.startJarvis = () => startJarvis({ show: interactive,
  ...(interactive ? { notifySchedule: () => ({ status: 'unsupported' as const }) } : {}),
  ...(injectedPolicy ? { hatchPolicy: { baseDurationMs: 1000, careReductionMs: { touch: 100, stroke: 200 }, maxCareReductionMs: 300, careIntervalMs: 100 } } : {}),
  ...(readinessMode || productPolicyMode ? { eggNow: () => eggNow } : {}),
  onReady: async pet => { try {
    const db = new DatabaseSync(petDatabasePath(directory));
    const state = (): Lifecycle => JSON.parse(String(db.prepare('SELECT snapshot FROM lifecycle').get()?.snapshot));
    const original = state();
    const run = <T = any>(script: string): Promise<T> => pet.webContents.executeJavaScript(script);
    const read = () => run<HatchView>('window.hatch.read()');
    const rendered = (step: string) => run<boolean>(`document.querySelector('#hatch-overlay').dataset.step === ${JSON.stringify(step)} && document.querySelector('#hatch-overlay').childElementCount > 0`);
    if (mode === 'inspect' || mode === 'policy-inspect') {
      assert.equal(pet.isVisible(), false);
      if (original.ready && original.name === null) assert.equal((await read()).available, false);
      if (mode === 'policy-inspect') {
        assert.equal(original.completed, null); assert.equal(original.stage, 'egg');
        assert.equal(original.orbId, null); assert.equal(original.name, null);
      }
    } else if (readinessMode) {
      if (mode !== 'ready-startup') {
        assert.equal(original.ready, false);
        const careMode = mode.endsWith('care');
        eggNow += injectedPolicy ? (careMode ? 900 : 1000) : (careMode ? 23.5 : 24) * 60 * 60 * 1000;
        if (careMode) {
          await run('window.petWindow.beginDrag(); window.petWindow.endDrag()');
          assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, 1);
        } else {
          powerMonitor.emit('lock-screen'); powerMonitor.emit('suspend'); powerMonitor.emit('resume');
        }
      }
      await until(() => state().ready);
      const prepared = state();
      assert.equal(prepared.completed, null); assert.equal(prepared.stage, 'egg');
      assert.equal(prepared.orbId, null); assert.equal(prepared.name, null);
      powerMonitor.emit('unlock-screen'); powerMonitor.emit('resume');
      assert.deepEqual(state(), prepared);
      await pause(750);
      const count = Number(db.prepare('SELECT count(*) n FROM egg_care').get()?.n);
      await run('window.petWindow.beginDrag(); window.petWindow.endDrag()');
      assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, count + 1);
      assert.deepEqual(state(), prepared);
    } else {
      assert.equal(pet.isVisible(), original.completed === null);
      assert.equal((await read()).available, false);
      assert.equal(trayMenu?.items[1].label, original.completed === null ? '부화 함께 보기' : '첫 만남 이어보기');
      for (const event of ['activate', 'second-instance']) {
        app.emit(event); await pause();
        assert.deepEqual(state(), original);
      }
      if (mode === 'exercise-edge') {
        const area = screen.getDisplayMatching(pet.getBounds()).workArea;
        pet.setPosition(area.x + area.width - 180, area.y + area.height - 200);
      }
      (trayMenu!.items[1].click as () => void)();
      await until(async () => (await read()).available);
      assert.equal(pet.isVisible(), true);
      assert.equal(BrowserWindow.getAllWindows().filter(w => w.getTitle().includes('첫 만남')).length, 0);
      await until(() => rendered(nextHatchStep(original)));
      if (mode === 'step' || mode === 'activation' || mode === 'policy-activation') {
        if (nextHatchStep(original) === 'naming') {
          await run('document.querySelector("#hatch-overlay input").value="별"; document.querySelector("#hatch-overlay form").requestSubmit()');
        }
        await until(() => state().revision === original.revision + 1);
        assert.equal(state().petId, original.petId);
        assert.equal(state().name, nextHatchStep(original) === 'naming' ? '별' : original.name);
        if (state().completed === 'baby') {
          assert.deepEqual(pet.getSize(), [420, 300]);
          assert.equal((await read()).layout.expanded, true);
        } else if (state().completed !== 'contact') assert.deepEqual(pet.getSize(), [180, 200]);
      } else if (mode.startsWith('exercise')) {
        pet.webContents.debugger.attach('1.3');
        await pet.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',
          { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        assert.equal(await run('getComputedStyle(document.querySelector("#hatch-overlay .hatch-egg")).animationName'), 'none');
        await pet.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
        pet.webContents.debugger.detach();
        // Prelude sway must not replace the approved 80% visual scale.
        assert.equal(await run(`(() => {
          const egg = document.querySelector('#hatch-overlay .hatch-egg');
          const animation = egg.getAnimations()[0];
          if (!animation) return false;
          animation.pause(); animation.currentTime = 550;
          const matrix = new DOMMatrix(getComputedStyle(egg).transform);
          return Math.abs(matrix.a - .8) < .001 && Math.abs(matrix.d - .8) < .001;
        })()`), true);
        assert.deepEqual(await run('Object.keys(window.hatch).sort()'), ['name', 'read', 'subscribe', 'witness']);
        assert.equal(await run('typeof require'), 'undefined');
        assert.equal(await run('typeof window.ipcRenderer'), 'undefined');
        const trusted = trustedEvent!;
        const before = state(); const view = await read();
        for (const channel of ['hatch:read', 'hatch:witness', 'hatch:name']) {
          assert.throws(() => handlers.get(channel)!({ ...trusted, sender: {} } as IpcMainInvokeEvent), /HATCH_REQUEST_DENIED/);
        }
        assert.throws(() => handlers.get('hatch:witness')!(trusted, view.state.revision, view.epoch, 'prepare'), /HATCH_REQUEST_DENIED/);
        assert.throws(() => handlers.get('hatch:name')!(trusted, view.state.revision, view.epoch, '별'), /INVALID_HATCH_ORDER/);
        assert.deepEqual(state(), before);
        for (const scene of hatchScenes) {
          await until(() => rendered(scene));
          if (scene === 'prelude' || scene === 'shell' || scene === 'contact') {
            writeFileSync(path.join(tmpdir(), `jarvis-inline-hatch-${scene}.png`),
              (await pet.webContents.capturePage()).toPNG());
          }
          const saved = state();
          const beforeBounds = scene === 'baby' ? pet.getBounds() : null;
          const beforeBody = scene === 'baby' ? await run<{ x: number; y: number }>(`(() => {
            const box = document.querySelector('#hatch-overlay .hatch-baby').getBoundingClientRect();
            return { x: box.x, y: box.y };
          })()`) : null;
          const prior = await read();
          powerMonitor.emit('lock-screen');
          assert.equal((await read()).available, false);
          await assert.rejects(run(`window.hatch.witness(${saved.revision}, ${prior.epoch}, '${scene}')`), /HATCH_PAUSED/);
          assert.deepEqual(state(), saved);
          powerMonitor.emit('unlock-screen');
          await until(() => rendered(scene));
          if (scene === 'baby') {
            db.exec("CREATE TRIGGER fail_scene BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
            await until(() => run('document.querySelector("#hatch-overlay [role=alert]").textContent.includes("저장하지 못")'));
            assert.deepEqual(state(), saved);
            assert.deepEqual(pet.getSize(), [180, 200]);
            db.exec('DROP TRIGGER fail_scene');
            await run('document.querySelector("#hatch-overlay button").click()');
          }
          await until(() => state().revision === saved.revision + 1);
          assert.equal(state().completed, scene);
          assert.equal(state().petId, original.petId);
          if (scene === 'baby') {
            assert.deepEqual(pet.getSize(), [420, 300]);
            assert.equal((await read()).layout.expanded, true);
            await until(() => rendered('contact'));
            await pause(750);
            const afterBounds = pet.getBounds();
            const afterBody = await run<{ x: number; y: number }>(`(() => {
              const box = document.querySelector('#hatch-overlay .hatch-baby').getBoundingClientRect();
              return { x: box.x, y: box.y };
            })()`);
            assert.ok(Math.abs(beforeBounds!.x + beforeBody!.x - afterBounds.x - afterBody.x) < 2);
            assert.ok(Math.abs(beforeBounds!.y + beforeBody!.y - afterBounds.y - afterBody.y) < 2);
            const area = screen.getDisplayMatching(afterBounds).workArea;
            assert.ok(afterBounds.x >= area.x && afterBounds.y >= area.y);
            assert.ok(afterBounds.x + afterBounds.width <= area.x + area.width);
            assert.ok(afterBounds.y + afterBounds.height <= area.y + area.height);
          }
        }
        if (mode === 'exercise-edge') assert.equal((await read()).layout.y, 68);
        await until(() => rendered('naming'));
        await until(() => run('Boolean(document.querySelector("#hatch-overlay form input"))'));
        await pause(120);
        assert.equal(pet.isFocusable(), true);
        assert.equal(await run('document.querySelector("#hatch-overlay").hidden'), false);
        assert.equal(await run('document.querySelector("#hatch-overlay form").getBoundingClientRect().height > 0'), true);
        assert.equal(await run(`(() => {
          const baby = document.querySelector('#hatch-overlay .hatch-baby').getBoundingClientRect();
          const card = document.querySelector('#hatch-overlay form').getBoundingClientRect();
          return card.top >= baby.bottom && card.right <= innerWidth && card.bottom <= innerHeight;
        })()`), true);
        assert.equal(await run('document.activeElement?.name'), 'pet-name');
        const hatchBounds = pet.getBounds();
        const hatchBody = await run<{ x: number; y: number }>(`(() => {
          const box = document.querySelector('#hatch-overlay .hatch-baby').getBoundingClientRect();
          return { x: box.x, y: box.y };
        })()`);
        writeFileSync(path.join(tmpdir(), 'jarvis-inline-hatch-naming.png'),
          (await pet.webContents.capturePage()).toPNG());
        const nameView = await read();
        for (const name of ['', '   ', '가'.repeat(21), '별\n이']) {
          await assert.rejects(run(`window.hatch.name(${nameView.state.revision}, ${nameView.epoch}, ${JSON.stringify(name)})`), /INVALID_NAME/);
          assert.equal(state().name, null);
        }
        db.exec("CREATE TRIGGER fail_name BEFORE UPDATE ON lifecycle BEGIN SELECT RAISE(ABORT, 'test'); END");
        await run('document.querySelector("#hatch-overlay input").value=" 별 "; document.querySelector("#hatch-overlay form").requestSubmit()');
        await until(() => run('document.querySelector("#hatch-overlay form [role=alert]").textContent.includes("저장하지 못")'));
        assert.equal(state().name, null);
        assert.equal(await run('document.querySelector("#hatch-overlay input").value'), ' 별 ');
        db.exec('DROP TRIGGER fail_name');
        await run('document.querySelector("#hatch-overlay form").requestSubmit()');
        await until(() => state().name === '별');
        await until(() => run('document.querySelector("#pet-name").textContent === "별"'));
        await until(() => run('Boolean(document.querySelector("#egg").dataset.life)'));
        const lifeBounds = pet.getBounds();
        const lifeBody = await run<{ x: number; y: number }>(`(() => {
          const box = document.querySelector('#egg .shell').getBoundingClientRect();
          return { x: box.x, y: box.y };
        })()`);
        assert.ok(Math.abs(hatchBounds.x + hatchBody.x - lifeBounds.x - lifeBody.x) < 2,
          JSON.stringify({ hatchBounds, hatchBody, lifeBounds, lifeBody }));
        assert.ok(Math.abs(hatchBounds.y + hatchBody.y - lifeBounds.y - lifeBody.y) < 2,
          JSON.stringify({ hatchBounds, hatchBody, lifeBounds, lifeBody }));
        assert.equal((await run('window.petWindow.snapshot()')).petId, original.petId);
        assert.equal(await run(`(() => {
          const body = document.querySelector('#egg').getBoundingClientRect();
          const shell = document.querySelector('#egg .shell').getBoundingClientRect();
          return document.elementFromPoint(shell.x + shell.width / 2, shell.y + shell.height / 2)?.closest('#egg')?.id === 'egg' &&
            !document.elementFromPoint(body.x + 2, shell.y + shell.height / 2)?.closest('#egg');
        })()`), true);
        assert.equal((await run('window.petBrain.read()')).behavior, 'idle');
        const count = db.prepare('SELECT count(*) n FROM egg_care').get()?.n;
        await run('window.petWindow.beginDrag(); window.petWindow.endDrag()');
        assert.equal(db.prepare('SELECT count(*) n FROM egg_care').get()?.n, count);
      }
    }
    console.log(`HATCH_PRODUCT:${JSON.stringify(state())}`);
    db.close(); clearTimeout(timeout); app.quit();
  } catch (error) { console.error('HATCH_TEST_ASSERTION:', error); throw error; }
  }, onFailure: code => { console.error(`HATCH_PRODUCT_FAILED:${code}`); } });
require('../../src/main/index');
