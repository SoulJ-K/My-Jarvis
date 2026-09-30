import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, type Notification, type NotificationConstructorOptions } from 'electron';
import { scheduleNotifications, timerNotifications } from '../src/main/notifications';
import { TimerService } from '../src/assistant/timer';
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
  const make = (onShow?: (fake: FakeNotification) => void) => {
    const fake = new FakeNotification();
    fake.onShow = () => onShow?.(fake);
    const results: string[] = [];
    const notices = timerNotifications(undefined, {
      backend: { isSupported: () => true, create: () => fake as unknown as Notification },
      outcomeTimeoutMs: 15,
    });
    notices.notify(result => results.push(result));
    return { fake, results, notices };
  };
  const shown = make(fake => fake.emit('show'));
  assert.deepEqual(shown.results, ['shown'], 'a missing click is not a failure');
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

  const timedOut = make();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(timedOut.results, ['unknown']);
  assert.equal(timedOut.fake.closed, true);
  assert.equal(timedOut.fake.eventNames().length, 0);
  timedOut.fake.emit('show');
  assert.deepEqual(timedOut.results, ['unknown']);

  const disposed = make();
  disposed.notices.dispose();
  disposed.notices.dispose();
  disposed.notices.notify(() => assert.fail('notify after disposal'));
  disposed.fake.emit('failed', {}, 'late failure');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(disposed.results, []);
  assert.equal(disposed.fake.eventNames().length, 0);
  assert.equal(disposed.fake.closed, true);

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
    assert.equal(service.submit('success', '5분 타이머').ok, true);
    assert.equal(service.submit('success', '5분 타이머').ok, true);
    now += 300_000; service.tick(); service.tick();
    assert.equal(native.length, 1, 'one completed timer makes one OS request');
    assert.equal(timerOptions[0].silent, false, 'request OS sound without claiming playback');
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
  console.log('PASS: notification lifecycle, timer delivery/acknowledgement/duplicate checks, and schedule adapter (no native permission request)');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
