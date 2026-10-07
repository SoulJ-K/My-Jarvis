import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ReminderService } from '../src/assistant/reminders';
import { TimerService } from '../src/assistant/timer';
import { TimerRepository } from '../src/storage/timer-repository';
import { FollowupService } from '../src/assistant/followup';
import { FollowupRepository } from '../src/storage/followup-repository';
import { PanelController } from '../src/assistant/panel-controller';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { selectMenuTimer } from '../src/shared/timer';
import { panelAction } from '../src/assistant/panel-input';
function fixture(t:test.TestContext, stage:'egg'|'baby'='baby') {
  const directory=mkdtempSync(path.join(tmpdir(),'jarvis-v02-integration-'));
  let now=Date.now(); let delivered=0;
  const lifecycle=new LifecycleRepository(directory,{namePolicy:{trim:true,maxCodePoints:20},developmentTrigger:true});
  let state=lifecycle.read();
  if (stage==='baby') {
    state=lifecycle.apply(state.revision,{type:'prepare'});
    for (const scene of hatchScenes) state=lifecycle.apply(state.revision,{type:'witness',scene});
    lifecycle.apply(state.revision,{type:'name',name:'통합시험'});
  }
  lifecycle.close(); now=Date.now();
  const baby=new BabyLifeRepository(directory,()=>now);
  const timers=new TimerService(new TimerRepository(directory),{wall:()=>now,monotonic:()=>now},report=>{delivered++;report('failed');},()=>{});
  const followups=new FollowupService(new FollowupRepository(directory),()=>now);
  const controller=new PanelController(timers,undefined,followups,()=>stage,()=>{},async()=>({ok:false,message:'test'}),()=>now);
  t.after(()=>{timers.dispose();followups.dispose();baby.close();rmSync(directory,{recursive:true,force:true});});
  return {timers,followups,controller,baby,get delivered(){return delivered;}, get now(){return now;},
    advance(ms:number){now+=ms;timers.tick();controller.sync();baby.setAttention(controller.attention());}};
}
test('first not-yet is weak; repeated reminder is strong; unrelated task still holds life after cancellation',async t=>{
  const f=fixture(t);
  assert.equal(f.controller.submitTimer('one','라면 1초 타이머','hidden').ok,true);
  assert.equal(f.controller.submitTimer('two','차 1초 타이머','default').ok,true);
  f.advance(1000);assert.equal(f.delivered,2);assert.equal(f.controller.state().card,null);
  assert.equal(f.controller.acknowledge({kind:'timer',id:'one'}),true);
  assert.equal(f.controller.state().card?.id,'one');
  assert.equal((await f.controller.action({type:'later',kind:'timer',id:'one',round:0,delayMs:300000})).ok,true);
  assert.equal(f.controller.attention().level,1);assert.equal(f.controller.attention().holdLife,true);
  f.baby.setAttention(f.controller.attention());assert.equal(f.baby.canEatSnack(),false);
  f.advance(300000);const reminders=f.followups.tick();assert.equal(reminders.length,1);
  assert.equal(f.controller.state().card?.round,1);
  await f.controller.action({type:'later',kind:'timer',id:'one',round:1,delayMs:300000});
  assert.equal(f.controller.attention().level,2);assert.equal(f.controller.attention().intervalSeconds,60);
  await f.controller.action({type:'later',kind:'timer',id:'two',round:0,delayMs:300000});
  await f.controller.action({type:'cancel',kind:'timer',id:'one'});
  assert.equal(f.controller.attention().level,1);assert.equal(f.controller.attention().holdLife,true);
  await f.controller.action({type:'cancel',kind:'timer',id:'two'});
  assert.equal(f.controller.attention().level,0);assert.equal(f.controller.attention().holdLife,false);
});
test('ack is not done; stale card cannot complete a new reminder; undo is available for five seconds',async t=>{
  const f=fixture(t);f.controller.submitTimer('one','1초 타이머','default');f.advance(1000);
  await f.controller.action({type:'ack',kind:'timer',id:'one'});
  assert.equal(f.controller.state().items.length,1);
  await f.controller.action({type:'later',kind:'timer',id:'one',round:0,delayMs:300000});
  f.advance(300000);f.followups.tick();
  assert.equal((await f.controller.action({type:'done',kind:'timer',id:'one',round:0})).ok,false);
  assert.equal((await f.controller.action({type:'done',kind:'timer',id:'one',round:1})).ok,true);
  assert.equal(f.controller.state().card?.completed,true);assert.equal(f.controller.state().items.length,0);
  assert.equal((await f.controller.action({type:'undo',kind:'timer',id:'one'})).ok,true);
  assert.equal(f.controller.attention().level,1);
  await f.controller.action({type:'done',kind:'timer',id:'one',round:1});f.advance(5000);
  assert.equal((await f.controller.action({type:'undo',kind:'timer',id:'one'})).ok,false);
});
test('paused pin stays visible, does not block life, resumes and preserves hidden timer delivery',async t=>{
  const f=fixture(t);f.controller.submitTimer('one','1분 타이머','pinned');
  await f.controller.action({type:'pause',kind:'timer',id:'one'});
  assert.equal(selectMenuTimer(f.timers.views())?.id,'one');assert.equal(f.controller.attention().holdLife,false);
  f.controller.submitTimer('two','1초 타이머','hidden');f.advance(1000);assert.equal(f.delivered,1);
  assert.equal(selectMenuTimer(f.timers.views())?.id,'one');
  await f.controller.action({type:'resume',kind:'timer',id:'one'});assert.equal(f.controller.attention().holdLife,true);
});
test('egg never shows result card on failed delivery and legacy acknowledgement does not become new work',async t=>{
  const f=fixture(t,'egg');f.controller.submitTimer('one','1초 타이머','default');f.advance(121000);
  assert.equal(f.controller.state().card,null);assert.equal(f.delivered,1);
  await f.controller.action({type:'ack',kind:'timer',id:'one'});
  assert.equal(f.controller.state().items.length,0);
  assert.equal((await f.controller.action({type:'later',kind:'timer',id:'one',round:0,delayMs:300000})).ok,false);
  f.timers.submit('old','1초 타이머');f.advance(1000);f.timers.acknowledge('old');
  // A pre-existing acknowledged item without a follow-up record is registered as legacy.
  const other=f.timers.records().find(r=>r.id==='old')!;assert.equal(other.status,'acknowledged');
});
test('IPC input rejects malformed and stale-capability commands before scheduling',()=>{
  for (const input of [null,[],{type:'done',kind:'timer',id:'a'}, {type:'later',kind:'timer',id:'a',round:0,delayMs:NaN},
    {type:'pause',kind:'alarm',id:'a'},{type:'menu',kind:'timer',id:'../a',mode:'pinned'}]) assert.throws(()=>panelAction(input));
  assert.deepEqual(panelAction({type:'later',kind:'timer',id:'a',round:1,delayMs:300000}),{type:'later',kind:'timer',id:'a',round:1,delayMs:300000});
});

test('schedule read failure preserves independent timer controls and reports stale schedule data',async t=>{
 const f=fixture(t);let broken=false;
 const schedules={records(){if(broken)throw Error('fixture read failure');return [];}} as unknown as ReminderService;
 const panel=new PanelController(f.timers,schedules,f.followups,()=> 'baby',()=>{},async()=>({ok:false,message:'test'}),()=>f.now);
 panel.submitTimer('safe','2분 타이머','default');assert.equal(panel.state().warning,undefined);
 broken=true;assert.equal(panel.state().items[0].id,'safe');assert.ok(panel.state().warning);
 assert.equal((await panel.action({type:'pause',kind:'timer',id:'safe'})).ok,true);
 assert.equal(panel.attention().holdLife,false);
 broken=false;assert.equal(panel.state().warning,undefined);
});
