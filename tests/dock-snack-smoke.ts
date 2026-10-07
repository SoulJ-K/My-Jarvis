// Manual native drag fixture: no actual trash lookup or deletion is reachable.
import {app,dialog} from 'electron';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {LifecycleRepository} from '../src/storage/lifecycle-repository';
import {BabyLifeRepository} from '../src/storage/baby-life-repository';
import {loadOrCreateEgg} from '../src/storage/pet-repository';
import {hatchScenes} from '../src/pet/lifecycle';
import {createPetWindow,babyScreenBounds} from '../src/main/windows';
const directory=mkdtempSync(path.join(tmpdir(),'jarvis-dock-fixture-'));
app.setPath('userData',directory);app.setPath('sessionData',directory);
app.on('window-all-closed',()=>{});
app.on('quit',()=>{try{rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}});
app.whenReady().then(async()=>{
 app.dock?.hide();
 console.log('DOCK_FIXTURE_DEFAULT_HELPER:'+existsSync(path.join(app.getAppPath(),'dist/native/jarvis-dock-snack.node')));
 app.getAppPath=()=>path.resolve('.');
 console.log('DOCK_FIXTURE_HELPER:'+existsSync(path.join(app.getAppPath(),'dist/native/jarvis-dock-snack.node')));
 let lines=0;
 const diagnostics=setInterval(()=>{
  try {const all=readFileSync(path.join(directory,'pet-diagnostics.log'),'utf8').trim().split('\n');
   for(const line of all.slice(lines)){const code=line.split(' ').at(-1);if(code?.startsWith('dock_'))console.log('DOCK_EVENT:'+code);}
   lines=all.length;} catch {}
 },200);
 app.once('before-quit',()=>clearInterval(diagnostics));
 const life=new LifecycleRepository(directory,{namePolicy:{trim:true,maxCodePoints:20},developmentTrigger:true});
 let s=life.apply(0,{type:'prepare'});for(const scene of hatchScenes)s=life.apply(s.revision,{type:'witness',scene});
 life.apply(s.revision,{type:'name',name:'Dock 시험'});
 const baby=new BabyLifeRepository(directory);const identity=loadOrCreateEgg(directory);
 let count=0;
 const win=await createPetWindow(identity,true,()=>{},()=>({...identity,name:'Dock 시험'}),baby,()=>console.log('DOCK_FIXTURE_CLICK'),()=>false,async()=>{count++;console.log('DOCK_FIXTURE_REQUEST:'+count);await dialog.showMessageBox({type:'info',title:'Dock 연결 확인',message:'휴지통에 아기를 놓은 동작을 받았습니다.',detail:'시험 성공: 실제 파일을 조회하거나 삭제하지 않았습니다.',buttons:['확인']});},undefined,info=>console.log('DOCK_NATIVE_DIAGNOSTIC:'+JSON.stringify(info)));
 win.setPosition(400,350);
 console.log('DOCK_FIXTURE_READY:'+JSON.stringify(babyScreenBounds(win)));
 setTimeout(()=>{win.destroy();baby.close();life.close();app.quit();},600000);
}).catch(e=>{console.error(e);app.exit(1);});
