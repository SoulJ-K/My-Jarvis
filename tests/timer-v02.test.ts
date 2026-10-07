import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TimerService, parseTimerInput } from '../src/assistant/timer';
import { TimerRepository, timerDatabasePath } from '../src/storage/timer-repository';
import { formatMenuTimer, formatTimerRemaining, selectMenuTimer } from '../src/shared/timer';
function fixture(t: test.TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(),'timer-v02-'));
  let wall = 1800000000000, mono = 0;
  const delivered: string[] = [];
  let store: TimerRepository;
  const create = () => new TimerService(store = new TimerRepository(dir), {wall:()=>wall,monotonic:()=>mono},
    (report,row) => { delivered.push(row!.id); report('shown'); },()=>{});
  let service = create();
  t.after(()=>{service.dispose();rmSync(dir,{recursive:true,force:true});});
  return {dir,get service(){return service;},get store(){return store;},delivered,
    advance(ms:number){wall+=ms;mono+=ms;},wall(ms:number){wall+=ms;},restart(){service.dispose();mono=0;service=create();}};
}
test('duration parser supports ordered combinations and keeps full titles; malformed durations are not guessed',()=>{
  assert.deepEqual(parseTimerInput('긴 제목 1시간 2분 3초 타이머'),{title:'긴 제목',durationMs:3723000});
  assert.deepEqual(parseTimerInput('3분 타이머 라면'),{title:'라면',durationMs:180000});
  assert.deepEqual(parseTimerInput('5초 타이머'),{title:'타이머',durationMs:5000});
  for(const text of ['0초 타이머','1.5분 타이머','-3분 타이머','1분 2시간 타이머','1분 2분 타이머','1e3분 타이머','3분','3분 후 타이머'])
    assert.equal(parseTimerInput(text),null,text);
});
test('pause survives restart and sleep, then resume starts from preserved remaining time',t=>{
  const f=fixture(t);f.service.create('a',300000,{menu:'pinned',title:'라면'});f.advance(120000);
  assert.equal(f.service.pause('a').ok,true);f.advance(900000);f.restart();
  const row=f.service.views()[0];assert.equal(row.remainingMs,180000);assert.equal(row.menu,'pinned');
  assert.equal(formatMenuTimer(selectMenuTimer(f.service.views())!),'라면 ⏸ 03:00');
  assert.equal(f.service.resumeTimer('a').ok,true);f.advance(179999);f.service.tick();assert.deepEqual(f.delivered,[]);
  f.advance(1);f.service.tick();assert.deepEqual(f.delivered,['a']);assert.equal(selectMenuTimer(f.service.views()),undefined);
});
test('pin replacement is confirmed atomically, 179/180/181 seconds have distinct rules',t=>{
  for(const remaining of [179000,180000,181000]) {
    const f=fixture(t);f.service.create('a',remaining,{menu:'pinned'});f.service.create('b',600000);
    assert.equal(f.service.setMenu('b','pinned').pinConflictId,'a');assert.equal(selectMenuTimer(f.service.views())!.id,'a');
    assert.equal(f.service.setMenu('b','pinned','a').ok,true);assert.equal(f.service.views().find(r=>r.id==='a')!.autoExcluded,remaining<180000);
    f.service.cancel('b');const selected=selectMenuTimer(f.service.views());
    assert.equal(selected?.id,remaining===180000?'a':undefined);f.restart();
    assert.equal(selectMenuTimer(f.service.views())?.id,selected?.id);
  }
});
test('stale pin confirmation cannot replace a different pinned timer and hidden timers still notify',t=>{
  const f=fixture(t);f.service.create('a',5000,{menu:'pinned'});f.service.create('b',5000,{menu:'hidden'});f.service.create('c',5000);
  f.service.setMenu('c','pinned','a');assert.equal(f.service.setMenu('b','pinned','a').pinConflictId,'c');
  f.advance(5000);f.service.tick();assert.deepEqual(f.delivered.sort(),['a','b','c']);
});
test('restart preserves ended result and creates new identity; old delivery cannot overwrite the new run',t=>{
  const f=fixture(t);f.service.create('a',1000,{title:'테스트'});f.advance(1000);f.service.tick();
  assert.equal(f.service.restart('a','b').ok,true);assert.equal(f.service.records().find(r=>r.id==='a')!.systemDelivery,'shown');
  assert.equal(f.service.records().find(r=>r.id==='b')!.restartOf,'a');
  assert.equal(f.service.records().find(r=>r.id==='b')!.systemDelivery,'not-requested');
  assert.equal(f.service.restart('a','b').ok,true);assert.equal(f.service.restart('b','c').ok,true);
  assert.equal(f.service.records().find(r=>r.id==='b')!.status,'cancelled');
});
test('failed replacement rolls back the old pin and timer before announcing success',t=>{
  const f=fixture(t);f.service.create('a',5000,{menu:'pinned'});
  f.store.insert=()=>{throw Error('synthetic write failure');};
  assert.throws(()=>f.service.create('b',1000,{menu:'pinned',replacePinnedId:'a'}),/synthetic/);
  assert.equal(f.service.views().length,1);assert.equal(f.service.views()[0].menu,'pinned');
});
test('menu formatting rounds up, supports hours, truncates only display and uses stable tie order',t=>{
  const f=fixture(t);f.service.create('b',180000,{title:'아주 긴 제목입니다'});f.service.create('a',180000);
  assert.equal(selectMenuTimer(f.service.views())!.id,'a');
  assert.equal(formatTimerRemaining(3600001),'01:00:01');assert.equal(formatTimerRemaining(1),'00:01');
  assert.match(formatMenuTimer(f.service.views().find(r=>r.id==='b')!,3),/^아주 …/);
  assert.equal(f.service.records().find(r=>r.id==='b')!.title,'아주 긴 제목입니다');
});
test('synthetic v1 migration preserves acknowledgement and notification facts with a readable original backup',t=>{
  const f=fixture(t);f.service.dispose();
  // Fixture service gets a replacement before t.after; no user database is accessed.
  const file=timerDatabasePath(f.dir);rmSync(file);
  const db=new DatabaseSync(file);
  db.exec(`CREATE TABLE timers(id TEXT PRIMARY KEY,started_at INTEGER,due_at INTEGER,duration_ms INTEGER,status TEXT,reason TEXT,system_delivery TEXT,app_displayed INTEGER);
    CREATE UNIQUE INDEX one_pending_timer ON timers(status) WHERE status='pending';
    INSERT INTO timers VALUES('old',1000,301000,300000,'acknowledged','late','shown',1);
    PRAGMA application_id=1246778418; PRAGMA user_version=1;`);db.close();
  // Close is idempotent at service level after dispose.
  f.restart();const row=f.service.records()[0];assert.equal(row.status,'acknowledged');assert.equal(row.systemDelivery,'shown');assert.equal(row.appDisplayed,true);
  assert.deepEqual(f.service.views(),[]);assert.equal(row.title,'타이머');
  const backup=readdirSync(path.dirname(file)).find(n=>n.includes('.v1-backup-'))!;assert.ok(backup);
  const old=new DatabaseSync(path.join(path.dirname(file),backup),{readOnly:true});
  assert.equal(old.prepare('PRAGMA user_version').get()!.user_version,1);assert.equal(old.prepare('SELECT status FROM timers').get()!.status,'acknowledged');old.close();
  assert.ok(readFileSync(file).length>0);
});
test('pause follows monotonic remaining time despite wall-clock edits; paused default never steals menu slot',t=>{
  const f=fixture(t);f.service.create('a',300000);f.advance(120000);f.wall(3600000);
  assert.equal(f.service.pause('a').ok,true);assert.equal(f.service.views()[0].remainingMs,180000);assert.equal(selectMenuTimer(f.service.views()),undefined);
  f.wall(-7200000);f.restart();assert.equal(f.service.views()[0].remainingMs,180000);
  assert.equal(f.service.resumeTimer('a').ok,true);f.advance(180000);f.service.tick();assert.deepEqual(f.delivered,['a']);
});
test('ended and acknowledged timer cancellation remains separate from original delivery result',t=>{
  const f=fixture(t);f.service.create('a',1000);f.advance(1000);f.service.tick();f.service.acknowledge('a');
  assert.equal(f.service.cancel('a').ok,true);f.restart();
  const row=f.service.records()[0];assert.equal(row.status,'cancelled');assert.equal(row.systemDelivery,'shown');assert.equal(row.reason,'on-time');
});
test('late delivery reports update historical facts after cancellation without reviving the timer',t=>{
  const f=fixture(t);f.service.create('a',1000);f.advance(1000);f.service.tick();f.service.cancel('a');
  f.store.delivery('a','requested');f.restart();assert.equal(f.service.records()[0].systemDelivery,'unknown');
  assert.equal(f.service.records()[0].status,'cancelled');assert.deepEqual(f.service.views(),[]);
});
