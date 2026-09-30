import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TimerRepository, timerDatabasePath } from '../src/storage/timer-repository';
import { TimerService } from '../src/assistant/timer';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';

function fixture(t: test.TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-timer-'));
  let wall = 1_800_000_000_000, mono = 1000, deliveries = 0, changes = 0;
  const clock = { wall: () => wall, monotonic: () => mono };
  const create = () => new TimerService(new TimerRepository(directory), clock, report => { deliveries++; report('failed'); }, () => changes++);
  let service = create();
  t.after(() => { service.dispose(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, get service() { return service; }, get deliveries() { return deliveries; }, get changes() { return changes; },
    advance(ms: number) { wall += ms; mono += ms; }, wall(ms: number) { wall += ms; },
    restart() { service.dispose(); mono = 1000; service = create(); } };
}

test('only an explicit five-minute request is stored; duplicate requests and concurrent active timers are rejected', t => {
  const f = fixture(t);
  for (const input of ['알람 맞춰줘','3시에 알려줘','5초 타이머','x'.repeat(81),'']) assert.equal(f.service.submit('bad', input).ok, false);
  assert.equal(f.service.views().length, 0);
  assert.equal(f.service.submit('a','5분 타이머').ok,true);
  assert.equal(f.service.submit('a','5분 타이머').ok,true);
  assert.equal(f.service.submit('b','5분 타이머').ok,false);
  assert.equal(f.service.views().length,1);
});
test('live timer ignores wall clock changes and emits once on monotonic deadline', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머');
  f.wall(3_600_000); f.service.tick(); assert.equal(f.deliveries,0);
  f.wall(-7_200_000); f.advance(299999); f.service.tick(); assert.equal(f.deliveries,0);
  f.advance(1); f.service.tick(); f.service.tick();
  assert.equal(f.deliveries,1); assert.equal(f.service.views()[0].reason,'on-time');
  assert.equal(f.service.views()[0].systemDelivery,'failed');
  assert.equal(f.service.views()[0].appDisplayed,false);
  f.service.displayed('a'); assert.equal(f.service.views()[0].appDisplayed,true);
});
test('cancel is persisted, idempotent and never notifies after restart', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머'); assert.equal(f.service.cancel('a').ok,true);
  assert.equal(f.service.cancel('a').ok,false); f.advance(400000); f.restart(); f.service.tick();
  assert.equal(f.deliveries,0); assert.equal(f.service.views().length,0);
  assert.equal(f.service.submit('a','5분 타이머').ok,false);
});
test('restart restores future timer with its original deadline', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머'); f.advance(120000); f.restart();
  assert.equal(f.service.views()[0].remainingMs,180000);
  f.advance(180000); f.service.tick(); assert.equal(f.deliveries,1);
});
test('overdue restart restores inbox without a burst of OS notifications, acknowledgement persists', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머'); f.advance(600000); f.restart();
  assert.equal(f.service.views()[0].reason,'recovered'); assert.equal(f.deliveries,0);
  assert.equal(f.service.views()[0].systemDelivery,'not-requested');
  f.restart(); assert.equal(f.service.views().length,1);
  f.service.acknowledge('a'); f.restart(); assert.equal(f.service.views().length,0);
});
test('sleep resume catches a past deadline without calling it on-time; deadline beats late cancellation', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머'); f.wall(360000); f.service.resume();
  assert.equal(f.deliveries,1); assert.equal(f.service.views()[0].reason,'late');
  assert.equal(f.service.cancel('a').ok,false);
});
test('unknown notification result and unconfirmed app display survive a delivery interruption', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머');
  const store = new TimerRepository(f.directory); store.due('a','on-time'); store.delivery('a','requested'); store.close();
  f.restart(); assert.equal(f.service.views()[0].systemDelivery,'unknown');
  assert.equal(f.service.views()[0].appDisplayed,false); assert.equal(f.deliveries,0);
});
test('timer operations do not touch the pet database', t => {
  const f = fixture(t); loadOrCreateEgg(f.directory); const original = readFileSync(petDatabasePath(f.directory));
  f.service.submit('a','5분 타이머'); f.advance(300000); f.service.tick(); f.restart();
  assert.deepEqual(readFileSync(petDatabasePath(f.directory)), original);
});
test('invalid timer storage is preserved rather than replaced', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-invalid-timer-'));
  t.after(() => rmSync(directory, { recursive:true, force:true }));
  new TimerRepository(directory).close();
  writeFileSync(timerDatabasePath(directory), 'preserve invalid data');
  assert.throws(() => new TimerRepository(directory), /TIMER_STORAGE_INVALID/);
  assert.equal(readFileSync(timerDatabasePath(directory),'utf8'), 'preserve invalid data');
});
test('a failed write cannot announce registration success', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-failed-timer-'));
  t.after(() => rmSync(directory,{ recursive:true,force:true }));
  const store = new TimerRepository(directory);
  const service = new TimerService(store, { wall: () => Date.now(), monotonic: () => 0 }, () => {}, () => {});
  store.insert = () => { throw new Error('write failed'); };
  assert.throws(() => service.submit('a','5분 타이머'), /write failed/);
  assert.equal(service.views().length,0); service.dispose();
});
test('wall edit before a reported suspend does not shorten a running timer', t => {
  const f = fixture(t); f.service.submit('a','5분 타이머'); f.wall(3600000);
  f.service.suspend(); f.wall(120000); f.service.resume();
  assert.equal(f.deliveries,0); assert.equal(f.service.views()[0].remainingMs,180000);
  f.advance(180000); f.service.tick(); assert.equal(f.deliveries,1);
});

test('prompt countdown follows its deadline and cancels with its saved result intact', async () => {
  type Handler = (event?: Record<string, unknown>) => unknown;
  class Element {
    value = ''; textContent = ''; hidden = false; disabled = false;
    children: Element[] = [];
    onclick?: () => Promise<void>;
    private listeners = new Map<string, Handler[]>();
    classList = { toggle: () => {} };
    addEventListener(name: string, handler: Handler) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), handler]);
    }
    async emit(name: string, event: Record<string, unknown> = {}) {
      await Promise.all((this.listeners.get(name) ?? []).map(handler => handler(event)));
    }
    setAttribute(_name: string, _value: string) {}
    focus() {}
    replaceChildren() { this.textContent = ''; this.children = []; }
    append(...children: Element[]) { this.children.push(...children); }
  }
  const elements = new Map<string, Element>();
  const find = (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector)!;
  };
  const document = new Element() as Element & {
    querySelector: (selector: string) => Element;
    createElement: () => Element;
    hidden: boolean;
  };
  document.querySelector = find;
  document.createElement = () => new Element();
  document.hidden = false;
  let now = 0, nextTimer = 0, closes = 0, nextId = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const setFakeTimeout = (callback: () => void, delay: number) => {
    const id = ++nextTimer;
    timers.set(id, { due: now + delay, callback });
    return id;
  };
  const advance = (milliseconds: number) => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= now) { timers.delete(id); timer.callback(); }
    }
  };
  let onClose = () => {}, onOpen = () => {};
  let hasTimer = false;
  const window = {
    timerPanel: {
      read: async () => hasTimer ? [{ id: 'timer', status: 'pending', dueAt: 0 }] : [],
      cancel: async () => { hasTimer = false; return { ok: true, message: '타이머를 취소했습니다.' }; },
      submit: async () => ({ ok: true, message: '저장했습니다.' }),
      close: async () => { closes++; onClose(); },
      onClose: (handler: () => void) => { onClose = handler; },
      onOpen: (handler: () => void) => { onOpen = handler; },
      subscribe: () => {},
    },
    schedulePanel: {
      read: async () => [], discard: async () => {}, subscribe: () => {},
      preview: async () => ({ ok: true, message: '저장 전 확인해 주세요.', draft: {
        id: 'draft', kind: 'alarm', localDateTime: '2026-10-01T09:00', timeZone: 'Asia/Seoul',
        utcOffsetMinutes: 540, content: '확인',
      } }),
    },
  };
  runInNewContext(readFileSync(path.join(__dirname, '../src/renderer/prompt.js'), 'utf8'), {
    document, window, performance: { now: () => now },
    crypto: { randomUUID: () => `request-${++nextId}` },
    setTimeout: setFakeTimeout, clearTimeout: (id: number) => timers.delete(id),
  });
  const input = find('#request'), form = find('#timer-form'), result = find('#result');
  const submit = async (value: string) => {
    input.value = value;
    await form.emit('submit', { preventDefault: () => {} });
  };

  await submit('5분 타이머');
  assert.equal(result.textContent, '저장했습니다. 8초 뒤 입력창이 닫힙니다.');
  advance(1000); assert.match(result.textContent, /7초 뒤/);
  advance(1000); assert.match(result.textContent, /6초 뒤/);
  advance(3500); assert.match(result.textContent, /3초 뒤/, 'a delayed update recalculates elapsed time');
  advance(2500); assert.equal(closes, 1, 'the original eight-second deadline closes the prompt');

  onOpen();
  await submit('5분 타이머');
  const staleAfterClose = [...timers.values()][0]!.callback;
  onClose(); onOpen();
  await submit('5분 타이머');
  staleAfterClose();
  assert.equal(closes, 1, 'a previous window session cannot close a reopened prompt');
  assert.match(result.textContent, /8초 뒤/);
  // Bringing an already visible prompt forward does not replay the open signal.
  advance(1000); assert.match(result.textContent, /7초 뒤/);
  const staleAfterNewRequest = [...timers.values()][0]!.callback;
  await submit('잘했어');
  staleAfterNewRequest();
  assert.equal(closes, 1, 'an earlier request cannot close a newer result');
  assert.match(result.textContent, /8초 뒤/);

  await document.emit('pointerdown');
  assert.equal(result.textContent, '저장했습니다.');
  advance(10000); assert.equal(closes, 1);
  await submit('안녕');
  input.value = '다음 요청'; await input.emit('input');
  assert.equal(result.textContent, '저장했습니다.', 'editing keeps the saved result but cancels closing');
  advance(10000); assert.equal(closes, 1);
  await submit('안녕');
  await document.emit('keydown', { key: 'x' });
  assert.equal(result.textContent, '저장했습니다.', 'keyboard work cancels the closing notice');
  advance(10000); assert.equal(closes, 1);
  await submit('안녕');
  await input.emit('compositionstart');
  assert.equal(result.textContent, '저장했습니다.');
  advance(10000); assert.equal(closes, 1, 'Korean composition prevents closing');

  onClose(); onOpen();
  await submit('안녕');
  const staleAfterEscape = [...timers.values()][0]!.callback;
  await document.emit('keydown', { key: 'Escape', preventDefault: () => {} });
  assert.equal(closes, 2, 'Escape closes the prompt');
  onOpen();
  await submit('안녕');
  staleAfterEscape();
  assert.equal(closes, 2, 'Escape cancels the old countdown before reopening');
  onClose(); onOpen();
  hasTimer = true;
  await submit('5분 타이머');
  await Promise.resolve();
  await find('#timers').children[0]!.children[2]!.onclick!();
  assert.equal(result.textContent, '타이머를 취소했습니다.');
  await document.emit('keydown', { key: 'x' });
  assert.equal(result.textContent, '타이머를 취소했습니다.', 'interaction cannot restore stale registration success');
  onClose(); onOpen();
  await submit('내일 9시 알람 확인');
  assert.equal(result.textContent, '저장 전 확인해 주세요.');
  assert.equal(timers.size, 0, 'calendar preview never starts auto-close');
});
