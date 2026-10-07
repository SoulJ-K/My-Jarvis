import assert from 'node:assert/strict';
import { app, BrowserWindow, screen, powerMonitor, dialog } from 'electron';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TimerService } from '../src/assistant/timer';
import { TimerRepository } from '../src/storage/timer-repository';
import { ReminderService } from '../src/assistant/reminders';
import { ScheduleRepository } from '../src/storage/schedule-repository';
import { FollowupService } from '../src/assistant/followup';
import { FollowupRepository } from '../src/storage/followup-repository';
import { PanelController } from '../src/assistant/panel-controller';
import { BabyLifeRepository } from '../src/storage/baby-life-repository';
import { LifecycleRepository } from '../src/storage/lifecycle-repository';
import { loadOrCreateEgg } from '../src/storage/pet-repository';
import { hatchScenes } from '../src/pet/lifecycle';
import { createPetWindow, refreshBabyPresentation, babyScreenBounds, placeBabyAfterHatch } from '../src/main/windows';
import { createPromptWindows } from '../src/main/prompt-window';
import { createResultCardWindow } from '../src/main/result-card-window';
import { timerNotifications } from '../src/main/notifications';
const directory=mkdtempSync(path.join(tmpdir(),'jarvis-v02-screen-'));
app.setPath('userData',directory);app.on('window-all-closed',()=>{});
app.on('quit',()=>{try{rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{console.warn('fixture retained');}});
process.on('uncaughtException', error=>{console.error(error);app.exit(1);});
const timeout=setTimeout(()=>app.exit(2),45000);
const pause=(ms=60)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>Promise<boolean>) {for(let i=0;i<100;i++){if(await check())return;await pause(20);}throw new Error('UI_TIMEOUT');}
app.whenReady().then(async()=>{
  app.dock?.hide();
  const lifecycle=new LifecycleRepository(directory,{namePolicy:{trim:true,maxCodePoints:20},developmentTrigger:true});
  let saved=lifecycle.apply(0,{type:'prepare'});
  for(const scene of hatchScenes)saved=lifecycle.apply(saved.revision,{type:'witness',scene});
  lifecycle.apply(saved.revision,{type:'name',name:'통합시험'});
  let now=Date.now();let stage:'egg'|'baby'='egg';
  const baby=new BabyLifeRepository(directory,()=>now);const identity=loadOrCreateEgg(directory);
  const pet=await createPetWindow(identity,false,()=>{},()=>({...identity,name:'통합시험'}),baby);
  pet.webContents.setBackgroundThrottling(false);
  const card=await createResultCardWindow(pet);let panels:Awaited<ReturnType<typeof createPromptWindows>>;
  let joined:PanelController;let refreshing=false;
  const refresh=()=>{if(!joined||!panels||refreshing)return;refreshing=true;try{joined.sync();baby.setAttention(joined.attention());refreshBabyPresentation(pet);panels.refresh();card.refresh(stage==='baby'&&joined.state().card!==null);}finally{refreshing=false;}};
  class Notice extends EventEmitter{show(){this.emit('show');}close(){this.emit('close');}}
  const native:Notice[]=[];
  const notifier=timerNotifications(undefined,{backend:{isSupported:()=>true,create:()=>{const n=new Notice();native.push(n);return n;}},onClick:item=>{if(item)joined.acknowledge({kind:'timer',id:item.id},0);}});
  const timers=new TimerService(new TimerRepository(directory),{wall:()=>now,monotonic:()=>now},notifier.notify,refresh);
  const schedules=new ReminderService(new ScheduleRepository(directory),()=>now,(_row,report)=>report('shown'),refresh);
  const followups=new FollowupService(new FollowupRepository(directory),()=>now,refresh);
  joined=new PanelController(timers,schedules,followups,()=>stage,refresh,async()=>({ok:false,message:'실제 휴지통 검사는 하지 않습니다.'}),()=>now);
  panels=await createPromptWindows(timers,true,schedules,command=>{if(stage!=='baby')return null;baby.apply(command);refreshBabyPresentation(pet);return '아기의 몸짓과 감정구슬을 봐 주세요.';},{card:card.win,cardPage:card.page,api:{read:async()=>joined.state(),action:a=>joined.action(a),submitTimer:async(id,text,mode,replace)=>joined.submitTimer(id,text,mode,replace),snack:()=>joined.snack()}});
  const run=(source:string)=>panels.prompt.webContents.executeJavaScript(source);
  const crun=(source:string)=>card.win.webContents.executeJavaScript(source);
  panels.prompt.webContents.setBackgroundThrottling(false);card.win.webContents.setBackgroundThrottling(false);
  // Exercise the real documents and services without displaying or focusing OS windows.
  let promptVisible=false;panels.prompt.show=()=>{promptVisible=true;};panels.prompt.hide=()=>{promptVisible=false;};
  panels.prompt.focus=()=>{};panels.prompt.isVisible=()=>promptVisible;
  let cardVisible=false;card.win.showInactive=()=>{cardVisible=true;};card.win.hide=()=>{cardVisible=false;};
  card.win.isVisible=()=>{assert.equal(card.win.isDestroyed(),false,'sizing must stop when the card is destroyed');return cardVisible;};pet.isVisible=()=>true;
  panels.open();await until(()=>run("document.activeElement.id==='request'"));
  assert.equal(await run("document.querySelector('#baby-examples').hidden"),true);
  await run(`(()=>{const i=document.querySelector('#request');i.value='라면 3분 30초 타이머';i.dispatchEvent(new CompositionEvent('compositionstart'));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));i.dispatchEvent(new CompositionEvent('compositionend'));})()`);
  await until(async()=>timers.views().length===1);assert.equal(timers.views()[0].title,'라면');assert.equal(timers.views()[0].durationMs,210000);
  await pause(150);assert.equal(timers.views().length,1,'IME commit must submit exactly once');
  stage='baby';refresh();await until(()=>run("!document.querySelector('#baby-examples').hidden"));
  for (const text of ['뭐해?', '보고싶었어?', '구슬놀이', '그만']) {
    await run(`document.querySelector('#request').value=${JSON.stringify(text)};document.querySelector('#request').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#request').focus()`);
    await run("document.querySelector('#timer-form').requestSubmit()");
    await until(()=>run("document.querySelector('#request').value===''") );
    assert.equal(await run("document.querySelector('#request').getAttribute('aria-invalid')"),'false',text);
  }
  assert.equal(timers.views().length,1,'social input must not create a timer');
  const short=timers.create('short',1000,{title:'확인할 일',menu:'hidden'});assert.equal(short.ok,true);
  now+=1000;timers.tick();refresh();await pause();
  assert.equal(card.win.isVisible(),false,'no simultaneous app popup');assert.equal(panels.notice.isVisible(),false);
  native[native.length-1].emit('click');await until(()=>crun("document.querySelector('#card-title').textContent==='확인할 일'"));
  assert.equal(await crun("document.querySelector('#card-title').textContent"),'확인할 일');
  await pause(300);
  assert.equal(card.win.getBounds().width,280,'result card stays compact');
  assert.ok(card.win.getBounds().height<160,'collapsed card must not retain the old 330px footprint');
  assert.deepEqual(await crun("Array.from(document.querySelectorAll('#answers button')).map(b=>b.textContent)"),['했어요','아직이에요','취소할게요']);
  assert.equal(await crun("document.querySelector('#more')"),null);
  assert.equal(await crun(`(() => {const buttons=[...document.querySelectorAll('#answers button')].map(b=>b.getBoundingClientRect());
    return buttons.every(b=>b.width>0&&b.left>=0&&b.right<=innerWidth&&b.top===buttons[0].top)
      &&document.documentElement.scrollWidth<=innerWidth;})()`),true,'all three actions fit visibly on one row');
  assert.ok(await crun("document.body.dataset.placement"));
  await crun("document.querySelector('#later').click();document.querySelector('#back').click()");
  assert.equal(await crun("document.querySelector('#answers').hidden"),false);
    const body=babyScreenBounds(pet)!;const area=screen.getDisplayMatching(pet.getBounds()).workArea;
  if(body.y-card.win.getBounds().height-8>=area.y)
    assert.ok(card.win.getBounds().y+card.win.getBounds().height<=body.y,'card should be above when space permits');
  mkdirSync(path.resolve('.local/v02-integration/screens'),{recursive:true});
  writeFileSync(path.resolve('.local/v02-integration/screens/card.png'),(await card.win.webContents.capturePage()).toPNG());
  await crun("document.querySelector('#later').click();document.querySelector('#delay').value='5';document.querySelector('#later-form').requestSubmit()");
  await until(async()=>joined.attention().level===1);refresh();
  assert.equal(card.win.isVisible(),false);assert.equal(joined.attention().holdLife,true);
  now+=300000;timers.tick();assert.equal(followups.tick().length,1);refresh();
  await until(()=>crun("document.body.dataset.round==='1'"));
  assert.equal(await crun("document.querySelector('#delay').value"),'','new reminder must not retain the previous custom delay');
  await crun("document.querySelector('#later').click();document.querySelector('[data-minutes=\"5\"]').click()");
  await until(async()=>joined.attention().level===2);assert.equal(joined.attention().intervalSeconds,60);
  await joined.action({type:'ack',kind:'timer',id:'short'});refresh();await pause();
  await crun("document.querySelector('#done').click()");await until(()=>crun("!document.querySelector('#undo').hidden"));
  await crun("document.querySelector('#undo').click()");await until(async()=>joined.attention().level===2);
  const foreign=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../src/preload/prompt.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await foreign.loadFile(path.join(__dirname,'../src/renderer/prompt.html'));
  assert.equal(await foreign.webContents.executeJavaScript("window.assistantPanel.action({type:'cancel',kind:'timer',id:'short'}).then(()=>false,()=>true)"),true);
  assert.equal(await crun("window.assistantPanel.submitTimer('forbidden','1초 타이머','default').then(()=>false,()=>true)"),true);foreign.destroy();
  await crun("document.querySelector('#cancel').click()");
  await until(async()=>joined.attention().level===0);
  assert.equal(timers.views().some(t=>t.id==='short'),false,'cancelled timer leaves the active list');
  assert.equal(followups.records().find(t=>t.id==='short')?.status,'cancelled');
  assert.notEqual(timers.views().find(t=>t.id!=='short')?.status,'cancelled','cancel keeps the other timer');
  refresh();
  await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await until(async()=>!panels.prompt.isVisible());
  panels.open();await pause(150);
  const output=path.resolve('.local/v02-integration/screens');mkdirSync(output,{recursive:true});
  writeFileSync(path.join(output,'input.png'),(await panels.prompt.webContents.capturePage()).toPNG());
  writeFileSync(path.join(output,'baby.png'),(await pet.webContents.capturePage()).toPNG());
  console.log('PASS: hidden production-form examples/IME, stage help, notification-click handler/card, weak/strong reminder, cleared delay, compact card, done/undo, restrictions, Escape; checking motion/snack/cleanup next');
  // Observe actual main-process movement, with the test pet hidden and no OS cursor change.
  pet.hide();pet.isVisible=()=>true;powerMonitor.getSystemIdleTime=()=>0;
  refreshBabyPresentation(pet);await pause(200); // let the previous cancelled round stop before a fresh burst
  const motionArea=screen.getDisplayMatching(pet.getBounds()).workArea;
  pet.setPosition(motionArea.x+80,motionArea.y+Math.max(0,motionArea.height-340));
  placeBabyAfterHatch(pet,{x:36,y:152});
  const originalView=baby.view.bind(baby);
  baby.view=(state)=>({...originalView(state),attention:{holdLife:true,level:2,intervalSeconds:60,preference:'bottom'}});
  refreshBabyPresentation(pet);
  timers.create('stable-card',1000,{title:'움직여도 누를 수 있는 말풍선',menu:'hidden'});
  now+=1000;timers.tick();joined.acknowledge({kind:'timer',id:'stable-card'},0);refresh();
  await pause(250);
  const fixed=card.win.getBounds();
  const positions: {x:number;y:number}[]=[];
  for(let n=0;n<80;n++){
    await pause(50);positions.push(babyScreenBounds(pet)!);
    assert.deepEqual(card.win.getPosition(),[fixed.x,fixed.y],'open bubble must not chase the moving baby');
  }
  writeFileSync(path.resolve('.local/v02-integration/hop-motion-samples-03.json'),JSON.stringify(positions));
  const xs=positions.map(p=>p.x);
  assert.ok(Math.max(...xs)-Math.min(...xs)>300,'bottom urging must travel broadly');
  const settled=positions.slice(20);
  let still=0;for(let n=1;n<settled.length;n++)
    if(settled[n].x===settled[n-1].x&&settled[n].y===settled[n-1].y)still++;
  assert.ok(still>=5,'hops include a visible stationary landing pause');
  const floor=screen.getDisplayMatching(pet.getBounds()).workArea;
  const lowest=floor.y+floor.height-babyScreenBounds(pet)!.height;
  assert.ok(settled.some(p=>p.y<lowest-20),'hops visibly rise above the floor');
  assert.ok(settled.some(p=>p.y>=lowest-2),'hops land on the floor');
  await crun("document.querySelector('#later').click()");
  await pause(150);const expanded=card.win.getPosition();await pause(150);
  assert.deepEqual(card.win.getPosition(),expanded,'expanded delay picker remains stationary too');
  await crun("document.querySelector('#back').click();document.querySelector('#cancel').click()");
  await until(async()=>!timers.views().some(t=>t.id==='stable-card'));
  console.log('PASS: stationary bubble and picker remain actionable while baby hops with landing pauses');
  baby.view=originalView;refreshBabyPresentation(pet);
  // Exercise selection -> final consent -> synthetic deletion -> meal -> cooldown.
  // Override the main-owned factory before loading the flow; no user Trash is accessed.
  const trashModule=require('../src/main/trash-snack') as typeof import('../src/main/trash-snack');
  const factory=trashModule.createTrashSnackService;
  const openDialog=dialog.showOpenDialog, messageDialog=dialog.showMessageBox;
  const originalShow=BrowserWindow.prototype.show,originalFocus=BrowserWindow.prototype.focus;
  BrowserWindow.prototype.show=function(){};
  BrowserWindow.prototype.focus=function(){};
  const root=path.join(realpathSync(directory),'SyntheticTrash');mkdirSync(root,{mode:0o700});
  const files=['one.txt','two.txt','keep.txt'].map(name=>path.join(root,name));
  files.forEach(file=>writeFileSync(file,'synthetic'));
  const support={available:true,exactTrashOrder:false,conditionalDelete:false,dockDrop:false,
    selectionMode:'user-selected' as const,deletionSafety:'staged-revalidation' as const,message:'fixture'};
  trashModule.createTrashSnackService=hooks=>new trashModule.SelectedTrashSnackService(new trashModule.SelectedTrashSnackBackend(root,support),hooks);
  const {requestSnack}=require('../src/main/snack-flow') as typeof import('../src/main/snack-flow');
  let selections=0, consent=false;
  dialog.showOpenDialog=(async()=>{throw new Error('NATIVE_FILE_DIALOG_MUST_NOT_OPEN');}) as typeof openDialog;
  const picker=async()=>{
    let win:BrowserWindow|undefined;
    await until(async()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/snack-picker.html'));return Boolean(win);});
    const execute=(script:string)=>win!.webContents.executeJavaScript(script);
    await until(()=>execute("document.querySelectorAll('#files input').length===3"));
    selections++;
    return {win:win!,execute};
  };
  const selectTwo=async()=>{
    const view=await picker();
    assert.equal(await view.execute("document.querySelector('#next').disabled"),true);
    const all=await view.execute("window.trashPicker.read()");
    assert.equal(await view.execute("window.trashPicker.choose("+JSON.stringify(all.map((c:{id:string})=>c.id))+").then(()=>false,()=>true)"),true);
    const outsider=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'../src/preload/snack-picker.js'),sandbox:true,contextIsolation:true}});
    await outsider.loadFile(path.join(__dirname,'../src/renderer/snack-picker.html'));
    assert.equal(await outsider.webContents.executeJavaScript("window.trashPicker.read().then(()=>false,()=>true)"),true);
    assert.equal(await outsider.webContents.executeJavaScript("window.trashPicker.choose("+JSON.stringify([all[0].id])+").then(()=>false,()=>true)"),true);
    outsider.destroy();
    await view.execute(`for(const name of ['one.txt','two.txt'])Array.from(document.querySelectorAll('.file')).find(label=>label.textContent===name).querySelector('input').click()`);
    assert.equal(await view.execute("document.querySelectorAll('#files input:checked').length"),2);
    assert.equal(await view.execute("Array.from(document.querySelectorAll('#files input')).find(i=>!i.checked).disabled"),true);
    writeFileSync(path.resolve('.local/v02-integration/screens/snack-picker.png'),(await view.win.webContents.capturePage()).toPNG());
    await view.execute("document.querySelector('#next').click()");
  };
  dialog.showMessageBox=(async(...args:unknown[])=>{
    assert.equal((args[1] as {detail:string}).detail,'one.txt\ntwo.txt','final confirmation lists only selected files');
    return {response:consent?1:0,checkboxChecked:false};
  }) as typeof messageDialog;
  try {
    baby.setAttention({holdLife:false,level:0,intervalSeconds:60});
    const cancelled=requestSnack(baby,pet,true);
    const firstPicker=await picker();
    await firstPicker.execute("document.querySelector('#cancel').click()");
    assert.match((await cancelled).message,/취소했어요/);
    assert.ok(files.every(file=>existsSync(file)));
    const declined=requestSnack(baby,pet,true);await selectTwo();
    assert.match((await declined).message,/취소했어요/,'declined final confirmation must keep files');
    assert.ok(files.every(file=>existsSync(file)));
    consent=true;const eating=requestSnack(baby,pet,true);await selectTwo();
    await until(async()=>baby.view(baby.read()!).behavior==='eating');
    assert.equal(existsSync(files[0]),false);assert.equal(existsSync(files[1]),false);
    assert.equal(readFileSync(files[2],'utf8'),'synthetic');
    now+=5500;baby.apply({type:'tick'});
    assert.equal((await eating).ok,true);assert.equal(baby.canEatSnack(),false);
    const before=selections;assert.equal((await requestSnack(baby,pet,true)).ok,false);
    assert.equal(selections,before,'15-minute cooldown blocks before opening selection');
  } finally {trashModule.createTrashSnackService=factory;dialog.showOpenDialog=openDialog;dialog.showMessageBox=messageDialog;BrowserWindow.prototype.show=originalShow;BrowserWindow.prototype.focus=originalFocus;}
  // Destroy without dispose, then let the former sizing interval fire. No native error dialog may occur.
  card.win.destroy();await pause(250);card.dispose();card.dispose();
  notifier.dispose();panels.dispose();pet.destroy();timers.dispose();schedules.dispose();followups.dispose();baby.close();lifecycle.close();
  console.log('PASS: broad bottom travel, synthetic snack consent/deletion/meal/cooldown, destroyed-card cleanup');
  clearTimeout(timeout);app.quit();
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
