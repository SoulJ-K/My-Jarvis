import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
