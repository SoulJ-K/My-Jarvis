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
test('natural one-time requests keep their content and use the request time to resolve a spoken hour', () => inZone('Asia/Seoul', () => {
  const now = new Date(2026, 8, 26, 14).getTime();
  for (const input of [
    '오늘 여섯시 반에 퇴실체크 알람해줘',
    '오늘 18:30분에 퇴실체크 알람해줘',
    '오늘 18:30 알람 퇴실체크',
    '퇴실체크 알람해줘 오늘 여섯시 반에',
    '오늘 퇴실체크를 18:30분에 알람해줘',
    '오늘 여섯시 삼십분에 퇴실체크 알람해줘',
    '여섯시 반에 퇴실체크 알람해줘',
    '오늘 18:30분에 퇴실체크 알람해줘!',
  ]) {
    const result = parseSchedule('natural', input, now);
    assert.equal(result.ok, true, input);
    if (result.ok) {
      assert.equal(result.draft.localDateTime, '2026-09-26 18:30');
      assert.equal(result.draft.content, '퇴실체크');
      assert.equal(result.draft.kind, 'alarm');
    }
  }
  const ambiguous = parseSchedule('ambiguous', '내일 여섯시 반에 퇴실체크 알람해줘', now);
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) {
    assert.match(ambiguous.message, /오전·오후/);
    assert.deepEqual(ambiguous.clarification?.choices.map(choice => choice.label), ['오전 6:30', '오후 6:30']);
    for (const [index, choice] of (ambiguous.clarification?.choices ?? []).entries()) {
      const selected = parseSchedule('choice', choice.input, now);
      assert.equal(selected.ok, true);
      if (selected.ok) {
        assert.equal(selected.draft.localDateTime, `2026-09-27 ${index === 0 ? '06' : '18'}:30`);
        assert.equal(selected.draft.content, '퇴실체크');
      }
    }
  }
  for (const input of ['오늘 내일 18:30 알람 퇴실체크', '오늘 18:30 알람 퇴실체크 19:00', '오늘 18:30 알람 리마인더 퇴실체크'])
    assert.equal(parseSchedule('extra', input, now).ok, false, input);
  const late = parseSchedule('late', '여섯시 반에 퇴실체크 알람해줘', new Date(2026, 8, 26, 19).getTime());
  assert.equal(late.ok, false);
  if (!late.ok) assert.match(late.message, /이미 지난 시각/);
  const reminder = parseSchedule('reminder', '서류 확인 리마인더해줘 내일 오후 세시 반에', now);
  assert.equal(reminder.ok, true);
  if (reminder.ok) {
    assert.equal(reminder.draft.kind, 'reminder');
    assert.equal(reminder.draft.content, '서류 확인');
    assert.equal(reminder.draft.localDateTime, '2026-09-27 15:30');
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
test('natural alarm preview stays unsaved until confirmation and repeated confirmation makes one row', t => {
  const f = fixture(t);
  f.advance(5 * 3600000);
  const preview = f.service.preview('natural', '오늘 여섯시 반에 퇴실체크 알람해줘');
  assert.equal(preview.ok, true);
  assert.deepEqual(f.service.views(), []);
  assert.equal(f.service.confirm('natural').ok, true);
  assert.equal(f.service.confirm('natural').ok, true);
  assert.equal(f.service.views().length, 1);
  assert.equal(f.service.views()[0].content, '퇴실체크');
});
test('meridiem choice still requires the registration button', t => {
  const f = fixture(t);
  f.advance(5 * 3600000);
  const ambiguous = f.service.preview('choice', '내일 여섯시 반에 퇴실체크 알람해줘');
  assert.equal(ambiguous.ok, false);
  assert.equal(f.service.confirm('choice').ok, false);
  assert.deepEqual(f.service.views(), []);
  if (ambiguous.ok) return;
  const selected = f.service.preview('choice', ambiguous.clarification!.choices[1].input);
  assert.equal(selected.ok, true);
  assert.deepEqual(f.service.views(), []);
  assert.equal(f.service.confirm('choice').ok, true);
  assert.equal(f.service.views().length, 1);
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
