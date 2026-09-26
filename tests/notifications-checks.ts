import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { app, type Notification, type NotificationConstructorOptions } from 'electron';
import { scheduleNotifications, timerNotifications } from '../src/main/notifications';
import type { ScheduleRecord } from '../src/shared/schedule';

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
  shown.fake.emit('failed', {}, 'late failure');
  shown.fake.emit('close');
  assert.deepEqual(shown.results, ['shown']);
  shown.notices.dispose();

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
  console.log('PASS: 8 notification lifecycle cases and schedule content adapter (no native permission request)');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
