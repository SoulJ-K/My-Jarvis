import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, type Notification, type NotificationConstructorOptions } from 'electron';
import { scheduleNotifications, timerNotifications } from '../src/main/notifications';
import { TimerService } from '../src/assistant/timer';
import type { TimerRecord } from '../src/shared/timer';
import type { ScheduleRecord } from '../src/shared/schedule';
import { TimerRepository } from '../src/storage/timer-repository';

class FakeNotification extends EventEmitter {
  closed = false;
  onShow: () => void = () => {};
  show() { this.onShow(); }
  close() { this.closed = true; this.emit('close'); }
}

// No window, user DB, or native notification request is needed for these races.
app.whenReady().then(async () => {
  const subject: TimerRecord = { id:'click-target',title:'라면',startedAt:1000,dueAt:181000,durationMs:180000,
    status:'due',reason:'on-time',systemDelivery:'requested',appDisplayed:false,
    menu:'hidden',autoExcluded:false,pausedRemainingMs:null,restartOf:null };
  const make = (onShow?: (fake: FakeNotification) => void) => {
    const fake = new FakeNotification();
    fake.onShow = () => onShow?.(fake);
    const results: string[] = [];
    const clicks: (TimerRecord | undefined)[] = [];
    const notices = timerNotifications(undefined, {
      backend: { isSupported: () => true, create: () => fake as unknown as Notification },
      outcomeTimeoutMs: 15, onClick: item => clicks.push(item),
    });
    notices.notify(result => results.push(result), subject);
    return { fake, results, clicks, notices };
  };
  const shown = make(fake => fake.emit('show'));
  assert.deepEqual(shown.results, ['shown'], 'a missing click is not a failure');
  assert.equal(shown.fake.closed,false,'show must not retract the native notification');
  assert.ok(shown.fake.eventNames().includes('click'),'show must retain the late-click callback');
  assert.deepEqual(shown.clicks,[],'show alone is not acknowledgement');
  shown.fake.emit('click'); shown.fake.emit('click');
  assert.deepEqual(shown.clicks,[subject],'late click identifies the original timer exactly once');
  assert.deepEqual(shown.results,['shown'],'click does not overwrite a known delivery result');
  shown.notices.dispose();
  assert.equal(shown.fake.closed, false, 'shutdown must not withdraw a shown OS notice');
  shown.fake.emit('failed', {}, 'late failure');
  shown.fake.emit('close');
  assert.deepEqual(shown.results, ['shown']);

  const lateFailure = make(fake => fake.emit('show'));
  lateFailure.fake.emit('failed', {}, 'native delivery failed');
  assert.deepEqual(lateFailure.results, ['shown', 'failed'], 'a native failure overrides the earlier show signal');
  lateFailure.notices.dispose();

  const failed = make(fake => fake.emit('failed', {}, 'permission denied'));
  failed.fake.emit('show');
  assert.deepEqual(failed.results, ['failed']);
  assert.equal(failed.fake.eventNames().length, 0);

  const closed = make(fake => fake.emit('close'));
  assert.deepEqual(closed.results, ['unknown'], 'close before show must not leave a requested result');
  closed.fake.emit('click'); assert.deepEqual(closed.clicks,[],'native close is not a click');
  closed.notices.dispose();

  const timedOut = make();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(timedOut.results, ['unknown']);
  assert.equal(timedOut.fake.closed, false,'timeout must not withdraw a possibly accepted native notification');
  assert.ok(timedOut.fake.eventNames().includes('click'),'unknown outcome still permits a later click');
  assert.deepEqual(timedOut.clicks,[]);
  timedOut.fake.emit('show');
  assert.deepEqual(timedOut.results, ['unknown']);
  timedOut.fake.emit('click'); timedOut.fake.emit('click');
  assert.deepEqual(timedOut.clicks,[subject]);
  assert.equal(timedOut.fake.eventNames().length,0,'click releases callbacks after handling once');
  timedOut.notices.dispose();

  const shownAtDisposal = make(fake => fake.emit('show'));
  shownAtDisposal.notices.dispose(); shownAtDisposal.fake.emit('click');
  assert.equal(shownAtDisposal.fake.closed,false);
  assert.deepEqual(shownAtDisposal.clicks,[],'shutdown removes callbacks without withdrawing the shown alert');

  const disposed = make();
  disposed.notices.dispose();
  disposed.notices.dispose();
  disposed.notices.notify(() => assert.fail('notify after disposal'));
  disposed.fake.emit('failed', {}, 'late failure');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(disposed.results, []);
  assert.equal(disposed.fake.eventNames().length, 0);
  assert.equal(disposed.fake.closed, false,'shutdown must not retract an unresolved OS request');
  disposed.fake.emit('click'); assert.deepEqual(disposed.clicks,[]);

  const thrown = make(() => { throw new Error('native show failed'); });
  assert.deepEqual(thrown.results, ['failed']);
  assert.equal(thrown.fake.eventNames().length, 0);

  for (const supported of [false, true]) {
    const results: string[] = [];
    const notices = timerNotifications(undefined, { backend: {
      isSupported: () => supported,
      create: () => { throw new Error('constructor failed'); },
    } });
    notices.notify(result => results.push(result));
    assert.deepEqual(results, [supported ? 'failed' : 'unsupported']);
    notices.dispose();
  }
  const messages: NotificationConstructorOptions[] = [];
  const scheduleFake = new FakeNotification();
  scheduleFake.onShow = () => scheduleFake.emit('show');
  const scheduleResults: string[] = [];
  const schedule = scheduleNotifications(undefined, { backend: {
    isSupported: () => true,
    create: options => { messages.push(options); return scheduleFake as unknown as Notification; },
  } });
  schedule.notify({ kind: 'reminder', content: '서류 확인' } as ScheduleRecord,
    state => scheduleResults.push(state));
  assert.equal(messages[0].title, 'Jarvis Pet · 리마인더');
  assert.equal(messages[0].body, '서류 확인');
  assert.deepEqual(scheduleResults, ['shown']);
  schedule.dispose();

  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-notification-check-'));
  try {
    let now = 1_000_000;
    const native: FakeNotification[] = [];
    const timerOptions: NotificationConstructorOptions[] = [];
    const timerNotices = timerNotifications(undefined, { backend: {
      isSupported: () => true,
      create: options => {
        timerOptions.push(options);
        const fake = new FakeNotification(); native.push(fake);
        return fake as unknown as Notification;
      },
    } });
    const service = new TimerService(new TimerRepository(directory),
      { wall: () => now, monotonic: () => now }, timerNotices.notify, () => {});
    assert.equal(service.submit('success', '라면 5분 타이머').ok, true);
    assert.equal(service.submit('success', '라면 5분 타이머').ok, true);
    now += 300_000; service.tick(); service.tick();
    assert.equal(native.length, 1, 'one completed timer makes one OS request');
    assert.equal(timerOptions[0].silent, false, 'request OS sound without claiming playback');
    assert.equal(timerOptions[0].body,'라면 시간이 끝났습니다.','native text uses this timer’s saved title');
    assert.equal(service.views()[0].systemDelivery, 'requested');
    native[0].emit('show');
    assert.equal(service.views()[0].systemDelivery, 'shown');
    assert.equal(service.views()[0].appDisplayed, false);
    native[0].emit('close');
    assert.equal(service.views()[0].systemDelivery, 'shown', 'closing without a click is not a failure');
    service.displayed('success');
    assert.equal(service.views()[0].appDisplayed, true);
    service.acknowledge('success');
    assert.equal(service.views().length, 0, 'only explicit in-app acknowledgement clears the inbox');

    assert.equal(service.submit('failure', '5분 타이머').ok, true);
    now += 300_000; service.tick(); service.tick();
    assert.equal(native.length, 2);
    native[1].emit('failed', {}, 'UNErrorDomain Code=1');
    assert.equal(service.views()[0].systemDelivery, 'failed');
    assert.equal(service.views()[0].appDisplayed, false);
    assert.equal(service.views()[0].status, 'due', 'native failure leaves the app inbox available');
    service.dispose(); timerNotices.dispose();
  } finally { rmSync(directory, { recursive: true, force: true }); }
  console.log('PASS: notification lifecycle and late-click retention, timer delivery/acknowledgement/duplicate checks, and schedule adapter (no native permission request)');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
