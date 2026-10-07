import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FollowupService } from '../src/assistant/followup';
import { FollowupRepository, followupDatabasePath } from '../src/storage/followup-repository';
import { TimerRepository, timerDatabasePath } from '../src/storage/timer-repository';
import { ScheduleRepository, scheduleDatabasePath } from '../src/storage/schedule-repository';
const key={kind:'timer' as const,id:'a'};
function fixture(t:test.TestContext) {
  const dir=mkdtempSync(path.join(tmpdir(),'followup-'));let now=1800000000000;
  let store:FollowupRepository;
  const create=()=>new FollowupService(store=new FollowupRepository(dir),()=>now);
  let service=create();
  t.after(()=>{service.dispose();rmSync(dir,{recursive:true,force:true});});
  return {dir,get service(){return service;},get store(){return store;},get now(){return now;},
    advance(ms:number){now+=ms;},restart(){service.dispose();service=create();},
    register(id='a',kind:'timer'|'alarm'|'reminder'='timer'){return service.register({kind,id,title:id,dueAt:now});}};
}
test('first processing, not system visibility, starts the two-minute card wait; receipt is not completion',t=>{
  for(const state of ['failed','unknown','shown'] as const){
    const f=fixture(t);f.register();f.service.delivery(key,0,state);
    f.advance(119999);assert.equal(f.service.card(),null);f.advance(1);assert.equal(f.service.card()!.item.id,'a');
    assert.equal(f.service.attention().level,0);assert.equal(f.service.acknowledge(key,0),true);
    assert.equal(f.service.records()[0].status,'active');assert.equal(f.service.records()[0].notYetCount,0);
  }
});
test('explicit receipt opens clicked card first and responses continue oldest eligible item separately',t=>{
  const f=fixture(t);f.register();f.advance(10);f.register('b','alarm');f.advance(120000);
  assert.equal(f.service.card()!.item.id,'a');f.service.acknowledge({kind:'alarm',id:'b'},0);
  assert.equal(f.service.card()!.item.id,'b');assert.equal(f.service.card()!.remainingCount,1);
  f.service.done({kind:'alarm',id:'b'},0);assert.equal(f.service.card()!.item.id,'a');
  assert.equal(f.service.records().find(r=>r.id==='a')!.status,'active');
});
test('same id across schedule kinds is isolated and legacy acknowledgements never revive',t=>{
  const f=fixture(t);f.register();const legacy=f.service.register({kind:'alarm',id:'a',title:'old',dueAt:f.now-1000000},{legacyAcknowledged:true});
  assert.equal(legacy.status,'legacy');assert.equal(legacy.acknowledgedAt,null,'no invented historical acknowledgement timestamp');
  assert.equal(f.service.openCard({kind:'alarm',id:'a'}),false);f.advance(120000);f.restart();
  assert.equal(f.service.card()!.item.kind,'timer');assert.equal(f.service.card()!.remainingCount,0);
  assert.deepEqual(f.service.attention(),{holdLife:false,level:0,intervalSeconds:60});
});
test('not-yet changes once per round; explicit repeated postponements strengthen 1→2 and 60→45→30→15 only',t=>{
  const f=fixture(t);f.register();assert.equal(f.service.notYet(key,0,300000),true);
  assert.equal(f.service.notYet(key,0,300000),false);assert.equal(f.service.card(),null);
  assert.deepEqual(f.service.attention(),{holdLife:true,level:1,intervalSeconds:60});
  for(const [index,interval] of [60,45,30,15,15].entries()){
    f.advance(300000);const notices=f.service.tick();assert.equal(notices.length,1);assert.equal(notices[0].round,index+1);
    assert.ok(f.service.card());assert.equal(f.service.notYet(key,index,300000),false,'stale button cannot answer new round');
    assert.equal(f.service.notYet(key,index+1,300000),true);
    assert.deepEqual(f.service.attention(),{holdLife:true,level:2,intervalSeconds:interval});
    f.restart();assert.equal(f.service.attention().intervalSeconds,interval);
  }
  const before=f.service.attention();f.advance(10000000);f.service.tick();f.advance(10000000);f.service.tick();assert.deepEqual(f.service.attention(),before);
});
test('restart emits one overdue reminder per schedule, opens immediately and retains prior rounds and strength',t=>{
  const f=fixture(t);f.register();f.service.notYet(key,0,300000);f.advance(99999999);f.restart();
  const notices=f.service.tick();assert.equal(notices.length,1);assert.equal(notices[0].reason,'recovered');assert.ok(f.service.card());
  assert.equal(f.service.records()[0].rounds.length,2);assert.equal(f.service.records()[0].rounds[0].answer,'not-yet');
  assert.deepEqual(f.service.tick(),[]);f.restart();assert.deepEqual(f.service.tick(),[]);assert.equal(f.service.records()[0].rounds[1].delivery,'unknown');
  assert.equal(f.service.attention().level,1);
});
test('done undo restores own reminder and attention only for five seconds; cancellation invalidates undo and stale responses',t=>{
  const f=fixture(t);f.register();f.service.notYet(key,0,300000);f.service.done(key,0);
  assert.equal(f.service.attention().holdLife,false);f.advance(4999);f.restart();assert.equal(f.service.undo(key),true);
  assert.equal(f.service.attention().level,1);assert.equal(f.service.records()[0].rounds[0].answer,'not-yet');
  f.service.done(key,0);f.advance(5000);assert.equal(f.service.undo(key),false);
  assert.equal(f.service.cancel(key),true);assert.equal(f.service.undo(key),false);
  assert.equal(f.service.openCard(key,0),false);assert.equal(f.service.notYet(key,0,1),false);
  f.advance(1000000);assert.deepEqual(f.service.tick(),[]);
});
test('done before answer undo reopens card; invalid delays and duplicate completion do not mutate state',t=>{
  const f=fixture(t);f.register();f.service.openCard(key);const before=f.service.records();
  for(const delay of [0,-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER])assert.equal(f.service.notYet(key,0,delay),false);
  assert.deepEqual(f.service.records(),before);assert.equal(f.service.done(key,0),true);assert.equal(f.service.done(key,0),false);
  assert.equal(f.service.undo(key),true);assert.ok(f.service.card());assert.equal(f.service.notYet(key,0,1000),true);
});
test('multiple schedules use strongest single stage and shortest interval; paused timer does not hold life',t=>{
  const f=fixture(t);f.register();f.register('b','reminder');f.service.notYet(key,0,1000);
  f.advance(1000);f.service.tick();f.service.notYet(key,1,1000);f.service.notYet({kind:'reminder',id:'b'},0,1000);
  assert.deepEqual(f.service.attention(),{holdLife:true,level:2,intervalSeconds:60});f.service.done(key,1);
  assert.equal(f.service.attention().level,1);f.service.cancel({kind:'reminder',id:'b'});
  assert.equal(f.service.attention([{...key,status:'paused',dueAt:f.now+1000,remainingMs:1000}]).holdLife,false);
  for(const remainingMs of [179000,180000,181000])assert.equal(f.service.attention([{...key,status:'pending',dueAt:f.now+1000000,remainingMs}]).holdLife,remainingMs<=180000);
  assert.equal(f.service.attention([{kind:'alarm',id:'date',status:'pending',dueAt:f.now+1000}]).holdLife,true);
});
test('failed writes never publish a done result or consume reminder batches partially',t=>{
  const f=fixture(t);f.register();f.register('b');f.service.notYet(key,0,1000);f.service.notYet({...key,id:'b'},0,1000);
  const save=f.store.save.bind(f.store);let saves=0;
  f.store.save=()=>{throw Error('synthetic write failure');};assert.throws(()=>f.service.done(key,0),/synthetic/);assert.equal(f.service.records()[0].status,'active');
  f.store.save=r=>{if(++saves===2)throw Error('batch write failure');save(r);};f.advance(1000);
  assert.throws(()=>f.service.tick(),/batch write failure/);assert.ok(f.service.records().every(r=>r.round===0));
  f.store.save=save;assert.equal(f.service.tick().length,2);
});
test('followup storage does not rewrite original timer/schedule files and rejects corrupt files without replacing them',t=>{
  const f=fixture(t);new TimerRepository(f.dir).close();new ScheduleRepository(f.dir).close();
  const files=[timerDatabasePath(f.dir),scheduleDatabasePath(f.dir)],before=files.map(file=>readFileSync(file));
  f.register();f.service.notYet(key,0,1000);f.advance(1000);f.service.tick();f.restart();
  files.forEach((file,i)=>assert.deepEqual(readFileSync(file),before[i]));f.service.dispose();
  writeFileSync(followupDatabasePath(f.dir),'preserve corrupt');assert.throws(()=>new FollowupRepository(f.dir),/FOLLOWUP_STORAGE_INVALID/);
  assert.equal(readFileSync(followupDatabasePath(f.dir),'utf8'),'preserve corrupt');
});
