import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSchedule } from '../src/assistant/time-parser';
import { ReminderService, type NotifySchedule } from '../src/assistant/reminders';
import { ScheduleRepository, scheduleDatabasePath } from '../src/storage/schedule-repository';
import { loadOrCreateEgg, petDatabasePath } from '../src/storage/pet-repository';
import { TimerRepository, timerDatabasePath } from '../src/storage/timer-repository';

function inZone(zone: string, work: () => void) {
  const previous = process.env.TZ; process.env.TZ = zone;
  try { work(); } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
}
function fixture(t: test.TestContext, notify?: NotifySchedule) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jarvis-schedule-'));
  let now = new Date(2026, 8, 26, 9).getTime();
  let deliveries = 0;
  let store: ScheduleRepository;
  const create = () => {
    store = new ScheduleRepository(directory);
    return new ReminderService(store, () => now, notify ?? ((_row, report) => { deliveries++; report('failed'); }), () => {});
  };
  let service = create();
  t.after(() => { service.dispose(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, get service() { return service; }, get store() { return store!; }, get deliveries() { return deliveries; },
    advance(ms: number) { now += ms; }, restart() { service.dispose(); service = create(); },
    register(id = 'a', input = '오늘 10:00 리마인더 서류 확인') {
      assert.equal(service.preview(id, input).ok, true); assert.equal(service.confirm(id).ok, true);
    } };
}

test('explicit dates, 24-hour time, midnight/noon, and next-day year boundary parse without an LLM', () => inZone('Asia/Seoul', () => {
  const now = new Date(2026, 11, 31, 23).getTime();
  const result = parseSchedule('a','내일 오전 12시 알람',now);
  assert.equal(result.ok,true); if (!result.ok) return;
  assert.equal(result.draft.localDateTime,'2027-01-01 00:00');
  assert.equal(result.draft.timeZone,'Asia/Seoul'); assert.equal(result.draft.utcOffsetMinutes,540);
  for (const input of ['내일 오후 12시 알람','2027-01-01 12:00 알람']) {
    const noon = parseSchedule('a',input,now); assert.equal(noon.ok,true);
    if (noon.ok) assert.equal(noon.draft.localDateTime,'2027-01-01 12:00');
  }
}));
test('missing dates/meridiem/content and unsupported recurring or fuzzy input ask again without a draft', () => {
  const now = new Date(2026,8,26,9).getTime();
  for (const input of ['',null,'알람','3시에 알려줘','내일 3시 알람','오늘 10:00 리마인더','매일 오전 7시 알람',
    '내일 24:00 알람','내일 오후 0시 알람','내일 오전 13시 알람','내일 10:60 알람',
    '오늘 08:00 알람','2026-02-30 10:00 알람','2026-13-01 10:00 알람','내일 10:00 알려줘','x'.repeat(201)])
    assert.equal(parseSchedule('a',input,now).ok,false,String(input));
});
test('DST gaps and folds are rejected including a half-hour fold', () => {
  inZone('America/New_York', () => {
    const now = new Date(2026,0,1).getTime();
    for (const input of ['2026-03-08 02:30 알람','2026-11-01 01:30 알람'])
      assert.equal(parseSchedule('a',input,now).ok,false,input);
    assert.equal(parseSchedule('a','2026-03-08 03:30 알람',now).ok,true);
  });
  inZone('Australia/Lord_Howe', () => {
    assert.equal(parseSchedule('a','2026-04-05 01:45 알람',new Date(2026,0,1).getTime()).ok,false);
  });
});
test('preview does not persist; confirm saves the exact original date across midnight', t => {
  const f = fixture(t); f.advance(14 * 3600000);
  const preview = f.service.preview('a','내일 10:00 리마인더 서류 확인');
  assert.equal(preview.ok,true); assert.deepEqual(f.service.views(),[]);
  f.advance(2 * 3600000); assert.equal(f.service.confirm('a').ok,true);
  if (preview.ok) assert.equal(f.service.views()[0].dueAt,preview.draft.dueAt);
});
test('discarded, invalidated and expired previews cannot register', t => {
  const f = fixture(t); f.service.preview('a','오늘 10:00 알람'); f.service.discard();
  assert.equal(f.service.confirm('a').ok,false);
  f.service.preview('a','오늘 10:00 알람'); f.service.preview('b','3시 알람');
  assert.equal(f.service.confirm('a').ok,false);
  f.service.preview('a','오늘 10:00 알람'); f.advance(3600000);
  assert.equal(f.service.confirm('a').ok,false); assert.deepEqual(f.service.views(),[]);
});
test('confirmation retries create one row; two distinct requests can coexist and cancel independently', t => {
  const f = fixture(t); f.register(); assert.equal(f.service.confirm('a').ok,true);
  f.register('b','오늘 11:00 알람'); assert.equal(f.service.views().length,2);
  assert.equal(f.service.cancel('a').ok,true); f.restart();
  assert.equal(f.service.views().length,1); assert.equal(f.service.views()[0].id,'b');
  assert.equal(f.service.confirm('a').ok,false); assert.equal(f.service.preview('a','내일 10:00 알람').ok,false);
});
test('due deadline wins over cancellation, records failed delivery once, and retains until acknowledgement', t => {
  const f = fixture(t); f.register(); f.advance(3600000);
  assert.equal(f.service.cancel('a').ok,false); f.service.tick();
  assert.equal(f.deliveries,1); assert.equal(f.service.views()[0].systemDelivery,'failed');
  assert.equal(f.service.views()[0].reason,'on-time'); assert.equal(f.service.views()[0].appDisplayed,false);
  f.service.displayed('a'); f.restart(); assert.equal(f.service.views()[0].appDisplayed,true);
  assert.equal(f.service.views()[0].systemDelivery,'failed'); f.service.acknowledge('a'); f.restart(); assert.deepEqual(f.service.views(),[]);
});
test('future reservation survives restart unchanged; an overdue reservation is recovered without OS bursts', t => {
  const f = fixture(t); f.register(); const original = f.service.views()[0]; f.restart();
  assert.deepEqual(f.service.views()[0],original); f.advance(7200000); f.restart();
  assert.equal(f.service.views()[0].reason,'recovered'); assert.equal(f.service.views()[0].systemDelivery,'not-requested');
  assert.equal(f.deliveries,0); f.restart(); assert.equal(f.service.views().length,1);
});
test('wall-clock advance or resume catches up late; backward changes cannot emit twice', t => {
  const f = fixture(t); f.register(); f.advance(-3600000); f.service.tick(); assert.equal(f.deliveries,0);
  f.advance(10800000); f.service.tick(); assert.equal(f.deliveries,1); assert.equal(f.service.views()[0].reason,'late');
  f.advance(-10800000); f.service.tick(); f.advance(10800000); f.service.tick(); assert.equal(f.deliveries,1);
});
test('time zone changes preserve the confirmed instant and input zone across restart', t => {
  const f = fixture(t);
  inZone('Asia/Seoul', () => f.register('a','2027-01-01 12:00 알람'));
  const original = f.service.views()[0];
  inZone('America/Los_Angeles', () => { f.restart(); assert.deepEqual(f.service.views()[0],original); });
});
test('interrupted requested delivery becomes unknown without re-delivery', t => {
  const f = fixture(t, () => {}); f.register(); f.advance(3600000); f.service.tick();
  assert.equal(f.service.views()[0].systemDelivery,'requested'); f.restart();
  assert.equal(f.service.views()[0].systemDelivery,'unknown'); assert.equal(f.service.views()[0].appDisplayed,false);
});
test('without an OS adapter the service does not claim a delivery request', t => {
  const dir = mkdtempSync(path.join(tmpdir(),'jarvis-app-only-')); let now = Date.now();
  const service = new ReminderService(new ScheduleRepository(dir), () => now, undefined, () => {});
  t.after(() => { service.dispose(); rmSync(dir,{recursive:true,force:true}); });
  const p = service.preview('a','내일 12:00 알람'); assert.equal(p.ok,true); if (!p.ok) return;
  service.confirm('a'); now = p.draft.dueAt; service.tick();
  assert.equal(service.views()[0].systemDelivery,'not-requested'); assert.equal(service.views()[0].status,'due');
});
test('write failures never announce registration or cancellation success', t => {
  const f = fixture(t); f.service.preview('a','오늘 10:00 알람');
  const insert = f.store.insert.bind(f.store); f.store.insert = () => { throw new Error('write failed'); };
  assert.throws(() => f.service.confirm('a'),/write failed/); assert.deepEqual(f.service.views(),[]);
  f.store.insert = insert; assert.equal(f.service.confirm('a').ok,true);
  f.store.cancel = () => { throw new Error('write failed'); };
  assert.throws(() => f.service.cancel('a'),/write failed/); assert.equal(f.service.views()[0].status,'pending');
});
test('invalid schedule storage is preserved and pet/timer data are untouched', t => {
  const f = fixture(t); loadOrCreateEgg(f.directory); new TimerRepository(f.directory).close();
  const before = [petDatabasePath(f.directory),timerDatabasePath(f.directory)].map(file => readFileSync(file));
  f.register(); f.restart();
  for (const [index,file] of [petDatabasePath(f.directory),timerDatabasePath(f.directory)].entries()) assert.deepEqual(readFileSync(file),before[index]);
  const bad = mkdtempSync(path.join(tmpdir(),'jarvis-bad-schedule-'));
  t.after(() => rmSync(bad,{recursive:true,force:true})); new ScheduleRepository(bad).close();
  writeFileSync(scheduleDatabasePath(bad),'preserve this');
  assert.throws(() => new ScheduleRepository(bad),/SCHEDULE_STORAGE_INVALID/);
  assert.equal(readFileSync(scheduleDatabasePath(bad),'utf8'),'preserve this');
});
